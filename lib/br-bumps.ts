import { prisma } from "@/lib/prisma";
import { gerarToken, linkVideo, sufixoLink } from "@/lib/video";
import { ESPERA_FOTOS_BR_MIN, ehVideoLetraBr } from "@/lib/video-estado";
import { cortesBumpBr, ITENS_BUMP, type CorteBump } from "@/lib/br-entregas";

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

export { ESPERA_FOTOS_BR_MIN };
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

/** Vídeo do bump: PedidoVideo marcado com opcoes.modelo = "letra" (o upsell é o vídeo só de fotos). */
export const ehVideoLetra = ehVideoLetraBr;

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

/**
 * Pix pago: cria o vídeo (se tem o bump) e pede as fotos na hora. Nunca lança.
 * Também roda na música pronta, na rotina /api/bumps/reprocessar e no botão "Criar vídeo"
 * do painel: se o Pix caiu e o vídeo não foi criado, ele é criado aqui.
 */
export async function aoPagarBr(pedidoId: string): Promise<string> {
  try {
    const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { status: true, bumps: true, video: { select: { token: true } } } });
    const b = bumpsDe(p?.bumps);
    if (!p || b.video === undefined) return "sem_bump";
    if (p.video) return "ja_existe";
    if (p.status !== "pago") return "nao_pago";
    await prisma.pedidoVideo.create({
      data: {
        pedido_id: pedidoId, token: gerarToken(), status: "pago", pago_em: new Date(), producao: "aguardando_fotos",
        valor: b.video, opcoes: { modelo: "letra" }, enviado_em: new Date(),
      },
    });
    await pedirFotosBr(pedidoId);
    return "criado";
  } catch (e: any) {
    console.error("[bumps-br] aoPagarBr:", pedidoId, e?.message);
    return "falha";
  }
}

/** E-mail "Confirmação Vídeo" (o link pra subir as fotos). Também o "Reenviar pedido de fotos" do painel. */
export async function pedirFotosBr(pedidoId: string): Promise<string> {
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { nome: true, telefone: true, email: true, video: { select: { token: true } } } });
  if (!p?.video) return "sem_video";
  const link = linkVideo(p.video.token);
  return chamar("BR_N8N_FOTOS_WEBHOOK_URL", {
    pedido_id: pedidoId, nome: p.nome, telefone: p.telefone, email: p.email,
    link, sufixo: sufixoLink(link), max_fotos: 15, prazo_min: ESPERA_FOTOS_BR_MIN,
  }, "pedido de fotos");
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
    await prisma.pedidoVideo.update({ where: { pedido_id: pedidoId }, data: { producao: "renderizando", erro_msg: null, concluido_em: null, entrega_whatsapp: false } });
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
    if (b.pagina !== undefined && !jaEnviadoBr(p.bumps_enviados, "pagina")) r.pagina = await chamar("BR_N8N_PAGINA_WEBHOOK_URL", { pedido_id: pedidoId }, "envio da página");
    if (b.estilo !== undefined && !p.song_id2) r.estilo = await chamar("BR_N8N_ESTILO_WEBHOOK_URL", { pedido_id: pedidoId }, "estilo extra");
    if (b.video !== undefined) {
      await aoPagarBr(pedidoId);   // o vídeo não foi criado no Pix? cria agora (e pede as fotos)
      r.video = await dispararVideoBr(pedidoId);
    }
  } catch (e: any) {
    console.error("[bumps-br] aoMusicaProntaBr:", pedidoId, e?.message);
  }
  return r;
}

/*
  ENTREGAS por item e canal, na coluna bumps_enviados (sem coluna nova):
    "pagina.whats"   entregue no WhatsApp      "pagina.whats!"  deu erro no WhatsApp
    "estilo.email"   entregue no e-mail        "video.email!"   deu erro no e-mail
  item: musica | pagina | estilo | video · canal: whats | email. O token antigo "pagina" /
  "estilo" (bump_enviado) vale como WhatsApp entregue. A música também atualiza
  entrega_whatsapp / entrega_email, e o vídeo, PedidoVideo.entrega_whatsapp.
*/
export type Canal = "whats" | "email";

/** Já saiu por algum canal (pra não mandar de novo sozinho). */
export function jaEnviadoBr(lista: string | null | undefined, item: string): boolean {
  return String(lista || "").split(",").some((t) => t === item || t === `${item}.whats` || t === `${item}.email`);
}

/** Estado de um item num canal, lido dos tokens: "ok" | "erro" | null (não tentou). */
export function estadoEntregaBr(lista: string | null | undefined, item: string, canal: Canal): "ok" | "erro" | null {
  const t = String(lista || "").split(",");
  if (t.includes(`${item}.${canal}!`)) return "erro";
  if (t.includes(`${item}.${canal}`) || (canal === "whats" && t.includes(item))) return "ok";
  return null;
}

/** n8n avisa o resultado da entrega de um ou mais itens num canal. */
export async function marcarEntregaBr(pedidoId: string, itens: string[], canal: Canal, ok: boolean): Promise<void> {
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { bumps_enviados: true } });
  if (!p) return;
  const lista = new Set(String(p.bumps_enviados || "").split(",").filter(Boolean));
  for (const item of itens) {
    lista.delete(`${item}.${canal}`); lista.delete(`${item}.${canal}!`);
    lista.add(ok ? `${item}.${canal}` : `${item}.${canal}!`);
  }
  const data: Record<string, unknown> = { bumps_enviados: [...lista].join(",") };
  if (itens.includes("musica")) data[canal === "whats" ? "entrega_whatsapp" : "entrega_email"] = ok;
  await prisma.pedido.update({ where: { id: pedidoId }, data });
  if (ok && canal === "whats" && itens.includes("video")) {
    await prisma.pedidoVideo.updateMany({ where: { pedido_id: pedidoId }, data: { entrega_whatsapp: true } });
  }
}

/** Legado (bump_enviado {item}): o WhatsApp do item saiu. */
export async function marcarEnviadoBr(pedidoId: string, item: string): Promise<void> {
  await marcarEntregaBr(pedidoId, [item], "whats", true);
}

export type ItemEnvio = "musica" | "pagina" | "estilo" | "video" | "geral" | "fotos" | "criar_video";

/**
 * Botões do painel. "tudo" (Enviar) chama o envio da música de sempre (N8N_WEBHOOK_ENVIO_URL);
 * "geral" (Envio geral, só com order bump) manda UM e-mail com a música e todo item já criado;
 * "Reenviar" de uma linha chama o fluxo daquele item com `forcar`. Nada é
 * gerado de novo — o estilo só regera se o pedido não tem a página da 2ª música (pedido antigo).
 */
export async function reenviarBr(pedidoId: string, item: ItemEnvio | "tudo"): Promise<Record<string, string>> {
  const p = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { link_audio: true, link_pagina: true, song_id2: true, video: { select: { producao: true, opcoes: true } } },
  });
  if (!p) return { pedido: "nao_encontrado" };
  // Vídeo do bump: reenviar o pedido de fotos / criar o vídeo que não nasceu no Pix
  if (item === "fotos") return { fotos: await pedirFotosBr(pedidoId) };
  if (item === "criar_video") {
    const r = await aoPagarBr(pedidoId);
    return { criar_video: r === "criado" ? "disparado" : r };
  }
  // Envio geral: um e-mail só com a música e todo item já criado (fluxo "BR - Envio Geral")
  if (item === "geral") {
    return { geral: p.link_audio || p.link_pagina ? await chamar("BR_N8N_ENVIO_GERAL_WEBHOOK_URL", { pedido_id: pedidoId }, "envio geral") : "nao_gerado" };
  }
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

/* ── Início do painel: Order bumps por item (Compraram · Entregues · Pendentes · Erro) ──
   Pedidos com bump são poucos: lê só esses e classifica com a mesma regra das cores
   do pedido (lib/br-entregas.ts), então o número do quadro é a lista que abre. */
async function pedidosComBumpBr() {
  const ps = await prisma.pedido.findMany({
    where: { bumps: { not: null }, status: { in: ["pago", "cancelado"] } },
    select: {
      id: true, status: true, bumps: true, bumps_enviados: true, estilo2: true, gerou_musica: true,
      link_audio: true, link_pagina: true, link_audio2: true, link_pagina2: true, data_entrega: true,
      entrega_whatsapp: true, entrega_email: true,
      video: { select: { status: true, producao: true, entrega_whatsapp: true, erro_msg: true, atualizado_em: true, pago_em: true, concluido_em: true, fotos_em: true, opcoes: true, criado_em: true } },
    },
  });
  return ps;
}

export async function contarBumpsBr(): Promise<Record<string, Record<CorteBump, number>>> {
  const ps = await pedidosComBumpBr();
  const agora = Date.now();
  const out: Record<string, Record<CorteBump, number>> = {};
  for (const item of ITENS_BUMP) {
    out[item] = { todos: 0, entregue: 0, pendente: 0, erro: 0 };
    for (const p of ps) for (const c of cortesBumpBr(p, item, agora)) out[item][c]++;
  }
  return out;
}

export async function idsBumpBr(item: string, corte: string): Promise<string[]> {
  if (!(ITENS_BUMP as readonly string[]).includes(item)) return [];
  const ps = await pedidosComBumpBr();
  const agora = Date.now();
  return ps.filter((p) => cortesBumpBr(p, item as (typeof ITENS_BUMP)[number], agora).includes(corte as CorteBump)).map((p) => p.id);
}
