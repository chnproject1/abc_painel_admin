import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FILTROS_ES } from "@/lib/es-resumo";
import { refazerVideoEs, dispararEstiloEs, dispararCartoonEs } from "@/lib/video-es-producao";
import { ESPERA_FOTOS_MIN } from "@/lib/es-ofertas";

/**
 * Reprocessa geração e envio da operação ES — o que travou no caminho.
 *
 *   POST /api/es/reprocessar              header x-callback-secret
 *   POST /api/es/reprocessar?simular=1    só lista o que faria, sem disparar
 *
 * Chamado a cada 10 min pelo Power Automate ("abcMusic - ES - Reprocessa
 * Geração e Envio": Recurrence → este HTTP). A regra fica toda aqui:
 *
 *   etapa   travado quando                                   espera    limite
 *   musica  pago e sem música (inclusive erro de geração)    30 min    2 (gasta Suno)
 *   smtp    algo pronto e não entregue (música, página, estilo  30 min    2
 *           ou vídeo): envio geral pelo e-mail de suporte (SMTP,
 *           fluxo "ES - Envio SMTP"). O Resend fica só no envio
 *           inicial: erro nele quase sempre é a caixa do cliente.
 *   estilo comprou o estilo, música 1 pronta, estilo não     30 min    2 (gasta Suno)
 *           gerado nem entregue (inclusive erro de geração)
 *   video   erro, ou parado em produção > VIDEO_TRAVADO_MIN   —         3
 *   cartoon vídeo com letra (Order 1) que não saiu: Plus sem    —         3
 *           fotos depois de ESPERA_FOTOS_MIN (sai sem fotos) ou
 *           esperando com a música pronta há > 30 min (disparo perdido)
 *
 * "Espera" conta da compra e também do último reprocesso da mesma etapa, pra
 * não disparar de novo antes do fluxo anterior terminar. Passou do limite,
 * para de tentar e fica na visão geral como pendência pra resolver na mão.
 * A confirmação do vídeo não entra aqui: tem o reenvio próprio
 * (/api/es/video/confirmacoes).
 */

const ETAPAS = {
  musica: { espera: 30, limite: 2, coluna: "reprocesso_musica" },
  smtp:   { espera: 30, limite: 2, coluna: "reprocesso_envio" },
  video: { espera: 0,  limite: 3, coluna: "reprocesso_video" },
  estilo: { espera: 30, limite: 2, coluna: "up_tentativa_geracao" },
  cartoon: { espera: 0, limite: 3, coluna: "reprocesso_video" },
} as const;
type Etapa = keyof typeof ETAPAS;

const LOTE = 20;   // por etapa, por execução

function autorizado(req: NextRequest): boolean {
  const secret = process.env.ES_N8N_SECRET || process.env.ES_CHECKOUT_SECRET || process.env.US_N8N_SECRET || process.env.US_CHECKOUT_SECRET;
  if (!secret) return true; // sem segredo configurado, rota aberta (igual ao /api/es/n8n)
  const token =
    req.headers.get("x-callback-secret") ??
    req.headers.get("x-checkout-secret") ??
    req.nextUrl.searchParams.get("secret");
  return token === secret;
}

const minAtras = (min: number) => new Date(Date.now() - min * 60000);

/** Pago, com a música pronta, e algo já pronto que não foi entregue: o que o envio geral resolve */
const SMTP_PENDENTE = {
  status: "pago", link_audio: { not: null },
  OR: [
    { entrega_email: false },
    { AND: [FILTROS_ES.pagina_pendente()] },
    { AND: [FILTROS_ES.estilo_pendente()], link_audio2: { not: null } },
    { video: { is: { producao: "concluido", entrega_email: false } } },
  ],
};

/** Mesmo disparo dos botões do pedido (/api/es/trigger) */
async function chamarN8n(env: string, corpo: Record<string, unknown>): Promise<string> {
  const url = process.env[env] || process.env[env.replace(/^ES_/, "US_")];
  if (!url) return "sem_url";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? "disparado" : `n8n_${r.status}`;
  } catch (e: any) {
    return "erro: " + (e?.message ?? "rede");
  }
}

/** O que cada etapa dispara */
const DISPARO: Record<Etapa, (id: string) => Promise<string>> = {
  musica: (id) => chamarN8n("ES_N8N_WEBHOOK_URL", { pedido_id: id, payment_id: id, tipo: "principal" }),
  smtp:   (id) => chamarN8n("ES_N8N_ENVIO_SMTP_WEBHOOK_URL", { pedido_id: id, payment_id: id, tipo: "envio_smtp" }),
  video: (id) => refazerVideoEs(id),
  estilo: (id) => dispararEstiloEs(id, true),
  cartoon: (id) => dispararCartoonEs(id),
};

/** Quem está travado em cada etapa (as regras de "pendente"/"erro" do painel + espera e limite) */
function ondeTravado(etapa: Etapa) {
  const { espera, limite, coluna } = ETAPAS[etapa];
  const naoRecente = espera
    ? [{ criado_em: { lt: minAtras(espera) } }, { OR: [{ reprocesso_em: null }, { reprocesso_em: { lt: minAtras(espera) } }] }]
    : [];
  const regra =
    etapa === "musica" ? { status: "pago", link_audio: null, gerou_musica: false }
    // atualizado_em: o e-mail do estilo/vídeo sai logo depois de gerar — espera ele antes de mandar de novo
    : etapa === "smtp" ? { AND: [SMTP_PENDENTE], atualizado_em: { lt: minAtras(espera) } }
    // atualizado_em: o music_ready (que dispara o estilo) mexe na linha — sem
    // isto, um estilo disparado há 2 min seria disparado de novo (Suno em dobro)
    : etapa === "cartoon" ? { status: "pago", link_audio: { not: null }, video: { is: {
        opcoes: { path: ["modelo"], equals: "cartoon" },
        OR: [
          { producao: "aguardando_fotos", criado_em: { lt: minAtras(ESPERA_FOTOS_MIN) } },
          { producao: { in: ["aguardando_musica", "fotos_enviadas"] }, atualizado_em: { lt: minAtras(30) } },
        ],
      } } }
    : etapa === "estilo" ? { AND: [FILTROS_ES.estilo()], status: "pago", link_audio: { not: null }, up_gerou_musica: false, up_entrega_email: false, atualizado_em: { lt: minAtras(espera) } }
    : { AND: [FILTROS_ES.video_erro()], link_audio: { not: null } };
  return { AND: [regra, ...naoRecente, { [coluna]: { lt: limite } }] };
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const simular = req.nextUrl.searchParams.get("simular") === "1";

  const saida: Record<string, { id: string; tentativa: number; resultado: string }[]> = {};
  for (const etapa of Object.keys(ETAPAS) as Etapa[]) {
    const { coluna } = ETAPAS[etapa];
    const pedidos = await prisma.pedidoEs.findMany({
      where: ondeTravado(etapa) as any,
      select: { id: true, [coluna]: true } as any,
      orderBy: { criado_em: "asc" },
      take: LOTE,
    }) as any[];

    saida[etapa] = [];
    for (const p of pedidos) {
      const tentativa = Number(p[coluna] ?? 0) + 1;
      if (simular) { saida[etapa].push({ id: p.id, tentativa, resultado: "simulado" }); continue; }
      // Conta antes de disparar: se o n8n travar, não fica tentando pra sempre
      await prisma.pedidoEs.update({ where: { id: p.id }, data: { [coluna]: { increment: 1 }, reprocesso_em: new Date() } });
      saida[etapa].push({ id: p.id, tentativa, resultado: await DISPARO[etapa](p.id) });
    }
  }

  // Quem esgotou as tentativas: fica pra resolver na mão (aparece na visão geral)
  const [mus, env, vid, est] = await Promise.all([
    prisma.pedidoEs.count({ where: { status: "pago", link_audio: null, gerou_musica: false, reprocesso_musica: { gte: ETAPAS.musica.limite } } }),
    prisma.pedidoEs.count({ where: { AND: [SMTP_PENDENTE], reprocesso_envio: { gte: ETAPAS.smtp.limite } } as any }),
    prisma.pedidoEs.count({ where: { AND: [FILTROS_ES.video_erro()], reprocesso_video: { gte: ETAPAS.video.limite } } as any }),
    prisma.pedidoEs.count({ where: { AND: [FILTROS_ES.estilo()], status: "pago", up_gerou_musica: false, up_entrega_email: false, up_tentativa_geracao: { gte: ETAPAS.estilo.limite } } as any }),
  ]);

  return NextResponse.json({
    success: true, simulado: simular,
    ...saida,
    no_limite: { musica: mus, envio: env, video: vid, estilo: est },
  });
}
