import { prisma } from "@/lib/prisma";
import { gerarToken, linkVideo, sufixoLink } from "@/lib/video";

/*
  ORDER BUMPS DO BR (QUIZ BR V2) — pagos no MESMO Pix da música.

    video   vídeo com a letra animada + até 15 fotos (cartoon-render, idioma pt)
    estilo  a mesma letra noutro estilo (2ª música pelo Suno)
    pagina  a Página Premium — já é gerada junto da música; o bump só ENVIA o link

  Pedido.bumps = "video:29.90,estilo:24.90,pagina:19.90". Sem bump = vazio, e nada
  daqui roda: o pedido segue igual a antes.

  Quem chama:
    aoPagarBr        /api/checkout action "update" (o Pix caiu)
    aoMusicaProntaBr /api/n8n music_ready (música principal pronta)
    dispararVideoBr  também quando as fotos chegam (/api/video acao fotos) e na
                     rotina /api/bumps/reprocessar (2 h sem fotos → sai sem fotos)

  Cada etapa chama um webhook do n8n (variáveis BR_N8N_*). Sem a variável, só loga.
*/

export const ESPERA_FOTOS_BR_MIN = 120;
export type ItemBump = "video" | "estilo" | "pagina";

/** "video:29.90,estilo:24.90" → { video: 29.9, estilo: 24.9 } */
export function bumpsDe(texto: string | null | undefined): Partial<Record<ItemBump, number>> {
  const out: Partial<Record<ItemBump, number>> = {};
  for (const par of String(texto || "").split(",")) {
    const [k, v] = par.split(":").map((x) => x.trim());
    if (k === "video" || k === "estilo" || k === "pagina") out[k] = Number(v) || 0;
  }
  return out;
}

/** Vídeo do bump: PedidoVideo marcado com opcoes.modelo = "letra". */
export function ehVideoLetra(opcoes: unknown): boolean {
  return !!opcoes && typeof opcoes === "object" && (opcoes as any).modelo === "letra";
}

async function chamar(variavel: string, corpo: Record<string, unknown>, rotulo: string): Promise<string> {
  const url = process.env[variavel];
  if (!url) { console.error(`[bumps-br] ${variavel} não configurada — ${rotulo} não disparado:`, corpo.pedido_id); return "sem_url"; }
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo), signal: AbortSignal.timeout(8000),
    });
    console.log(`[bumps-br] ${rotulo}:`, corpo.pedido_id, "| n8n", r.status);
    return r.ok ? "disparado" : `n8n_${r.status}`;
  } catch (e: any) {
    console.error(`[bumps-br] falha em ${rotulo}:`, corpo.pedido_id, e?.message);
    return "falha";
  }
}

/** Pix pago: cria o vídeo (se tem o bump) e pede as fotos na hora. Nunca lança. */
export async function aoPagarBr(pedidoId: string): Promise<void> {
  try {
    const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { bumps: true, nome: true, telefone: true, email: true, video: true } });
    const b = bumpsDe(p?.bumps);
    if (!p || b.video === undefined || p.video) return;
    const token = gerarToken();
    await prisma.pedidoVideo.create({
      data: {
        pedido_id: pedidoId, token, status: "pago", pago_em: new Date(), producao: "aguardando_fotos",
        valor: b.video, opcoes: { modelo: "letra" }, enviado_em: new Date(),
      },
    });
    const link = linkVideo(token);
    await chamar("BR_N8N_FOTOS_WEBHOOK_URL", {
      pedido_id: pedidoId, nome: p.nome, telefone: p.telefone, email: p.email,
      link, sufixo: sufixoLink(link), max_fotos: 15, prazo_min: ESPERA_FOTOS_BR_MIN,
    }, "pedido de fotos");
  } catch (e: any) {
    console.error("[bumps-br] aoPagarBr:", pedidoId, e?.message);
  }
}

/**
 * Vídeo com letra: sai quando o pedido está pago, a música principal pronta e
 * as fotos chegaram — ou passou ESPERA_FOTOS_BR_MIN sem fotos (sai sem). `forcar`
 * (refazer pelo painel) ignora a espera.
 */
export async function dispararVideoBr(pedidoId: string, forcar = false): Promise<string> {
  try {
    const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { status: true, link_audio: true, video: true } });
    const v = p?.video;
    if (!p || !v || !ehVideoLetra(v.opcoes)) return "sem_video_letra";
    if (!p.link_audio) return "aguardando_musica";
    if (!forcar && ["renderizando", "concluido"].includes(v.producao)) return "ja_em_producao";
    const temFotos = Array.isArray(v.fotos) && (v.fotos as unknown[]).length > 0;
    const venceu = Date.now() - v.criado_em.getTime() > ESPERA_FOTOS_BR_MIN * 60000;
    if (!temFotos && !venceu && !forcar) return "aguardando_fotos";
    await prisma.pedidoVideo.update({ where: { pedido_id: pedidoId }, data: { producao: "renderizando", erro_msg: null } });
    return chamar("BR_N8N_VIDEO_LETRA_WEBHOOK_URL", { pedido_id: pedidoId }, "vídeo com letra");
  } catch (e: any) {
    console.error("[bumps-br] dispararVideoBr:", pedidoId, e?.message);
    return "falha";
  }
}

/** Música principal pronta: dispara cada bump comprado que ainda não saiu. Nunca lança. */
export async function aoMusicaProntaBr(pedidoId: string): Promise<Record<string, string>> {
  const r: Record<string, string> = {};
  try {
    const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { bumps: true, bumps_enviados: true, song_id2: true } });
    const b = bumpsDe(p?.bumps);
    if (!p || !Object.keys(b).length) return r;
    const feitos = String(p.bumps_enviados || "").split(",");
    if (b.pagina !== undefined && !feitos.includes("pagina")) r.pagina = await chamar("BR_N8N_PAGINA_WEBHOOK_URL", { pedido_id: pedidoId }, "envio da página");
    if (b.estilo !== undefined && !p.song_id2) r.estilo = await chamar("BR_N8N_ESTILO_WEBHOOK_URL", { pedido_id: pedidoId }, "estilo extra");
    if (b.video !== undefined) r.video = await dispararVideoBr(pedidoId);
  } catch (e: any) {
    console.error("[bumps-br] aoMusicaProntaBr:", pedidoId, e?.message);
  }
  return r;
}

/** n8n avisa que entregou um item (pagina | estilo): guarda pra não mandar de novo. */
export async function marcarEnviadoBr(pedidoId: string, item: string): Promise<void> {
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { bumps_enviados: true } });
  const lista = new Set(String(p?.bumps_enviados || "").split(",").filter(Boolean));
  lista.add(item);
  await prisma.pedido.update({ where: { id: pedidoId }, data: { bumps_enviados: [...lista].join(",") } });
}

export type ItemEnvio = "musica" | "pagina" | "estilo" | "video";

/**
 * Botões do painel. "tudo" (Enviar tudo) chama o fluxo "BR - Envio" (N8N_WEBHOOK_ENVIO_URL),
 * que manda a música e todo item já criado (página, estilo, vídeo) — WhatsApp de cada um e
 * um e-mail só. "Reenviar" de uma linha chama o fluxo daquele item com `forcar`. Nada é
 * gerado de novo — o estilo só regera se o pedido não tem a página da 2ª música (pedido antigo).
 */
export async function reenviarBr(pedidoId: string, item: ItemEnvio | "tudo"): Promise<Record<string, string>> {
  const p = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { link_audio: true, link_pagina: true, song_id2: true, video: { select: { producao: true, opcoes: true } } },
  });
  if (!p) return { pedido: "nao_encontrado" };
  if (item === "tudo" || item === "musica") {
    return { tudo: p.link_audio || p.link_pagina ? await chamar("N8N_WEBHOOK_ENVIO_URL", { payment_id: pedidoId, pedido_id: pedidoId }, "envio") : "nao_gerado" };
  }
  if (item === "pagina") {
    return { pagina: p.link_pagina ? await chamar("BR_N8N_PAGINA_WEBHOOK_URL", { pedido_id: pedidoId, forcar: true }, "reenvio da página") : "nao_gerado" };
  }
  if (item === "estilo") {
    return { estilo: p.song_id2 ? await chamar("BR_N8N_ESTILO_WEBHOOK_URL", { pedido_id: pedidoId, forcar: true }, "reenvio do estilo") : "nao_gerado" };
  }
  const videoPronto = !!p.video && ehVideoLetra(p.video.opcoes) && p.video.producao === "concluido";
  return { video: videoPronto ? await chamar("BR_N8N_VIDEO_LETRA_WEBHOOK_URL", { pedido_id: pedidoId, reenviar: true }, "reenvio do vídeo") : "nao_gerado" };
}
