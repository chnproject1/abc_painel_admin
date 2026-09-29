import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FILTROS_ES } from "@/lib/es-resumo";
import { dispararPaginaEs, refazerVideoEs } from "@/lib/video-es-producao";

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
 *   envio   música pronta e e-mail não saiu                   30 min    3
 *   pagina  comprou a página, música pronta, não entregue     30 min    3
 *   video   erro, ou parado em produção > VIDEO_TRAVADO_MIN   —         3
 *
 * "Espera" conta da compra e também do último reprocesso da mesma etapa, pra
 * não disparar de novo antes do fluxo anterior terminar. Passou do limite,
 * para de tentar e fica na visão geral como pendência pra resolver na mão.
 * A confirmação do vídeo não entra aqui: tem o reenvio próprio
 * (/api/es/video/confirmacoes).
 */

const ETAPAS = {
  musica: { espera: 30, limite: 2, coluna: "reprocesso_musica" },
  envio:  { espera: 30, limite: 3, coluna: "reprocesso_envio" },
  pagina: { espera: 30, limite: 3, coluna: "reprocesso_pagina" },
  video:  { espera: 0,  limite: 3, coluna: "reprocesso_video" },
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
  envio:  (id) => chamarN8n("ES_N8N_ENVIO_WEBHOOK_URL", { pedido_id: id, payment_id: id, tipo: "envio" }),
  pagina: (id) => dispararPaginaEs(id),
  video:  (id) => refazerVideoEs(id),
};

/** Quem está travado em cada etapa (as regras de "pendente"/"erro" do painel + espera e limite) */
function ondeTravado(etapa: Etapa) {
  const { espera, limite, coluna } = ETAPAS[etapa];
  const naoRecente = espera
    ? [{ criado_em: { lt: minAtras(espera) } }, { OR: [{ reprocesso_em: null }, { reprocesso_em: { lt: minAtras(espera) } }] }]
    : [];
  const regra =
    etapa === "musica" ? { status: "pago", link_audio: null, gerou_musica: false }
    : etapa === "envio" ? { status: "pago", link_audio: { not: null }, entrega_email: false }
    : etapa === "pagina" ? { AND: [FILTROS_ES.pagina_pendente()], link_pagina: { not: null } }
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
  const [mus, env, pag, vid] = await Promise.all([
    prisma.pedidoEs.count({ where: { status: "pago", link_audio: null, gerou_musica: false, reprocesso_musica: { gte: ETAPAS.musica.limite } } }),
    prisma.pedidoEs.count({ where: { status: "pago", link_audio: { not: null }, entrega_email: false, reprocesso_envio: { gte: ETAPAS.envio.limite } } }),
    prisma.pedidoEs.count({ where: { AND: [FILTROS_ES.pagina_pendente()], reprocesso_pagina: { gte: ETAPAS.pagina.limite } } as any }),
    prisma.pedidoEs.count({ where: { AND: [FILTROS_ES.video_erro()], reprocesso_video: { gte: ETAPAS.video.limite } } as any }),
  ]);

  return NextResponse.json({
    success: true, simulado: simular,
    ...saida,
    no_limite: { musica: mus, envio: env, pagina: pag, video: vid },
  });
}
