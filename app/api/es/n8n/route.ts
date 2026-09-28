import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkFotosEs, linkVerVideoEs, urlPublica } from "@/lib/video";
import { liberacoes } from "@/lib/es-ofertas";
import { marcarRastreio } from "@/lib/es-rastreio";
import { dispararProducaoVideoEs, refazerVideoEs, dispararPaginaEs } from "@/lib/video-es-producao";

/**
 * Callbacks das automações da operação ES (LATAM) (model PedidoEs).
 *
 * Mesmos nomes de ação do /api/n8n do BR, para os nós do n8n serem portados
 * trocando só a URL. As ações com prefixo `up_` são do segundo fluxo, que gera
 * as duas músicas extras do upsell 2.
 *
 * Proteção: aceita ES_N8N_SECRET e, se ela não existir, ES_CHECKOUT_SECRET (os nomes US_* antigos ainda valem) —
 * assim funciona sem criar uma variável nova. O header pode ser
 * `x-callback-secret` (igual ao BR) ou `x-checkout-secret`.
 *
 * Nenhuma ação mexe em `status` nem nos status das ofertas: isso é do checkout.
 * Todas as escritas são absolutas, então reenviar a mesma ação é inofensivo.
 */

const ACOES = [
  // Fluxo 1 — venda inicial, música 1
  "music_ready", "email_entregue", "email_erro", "erro_geracao",
  // Fluxo da página Premium (up1 / downsell)
  "pagina_entregue", "pagina_erro",
  // Fluxo 3 — upsell 2, músicas 2 e 3
  "up_music_ready", "up_email_entregue", "up_email_erro", "up_erro_geracao",
  // Rastreio — venda da frente registrada na UTMify/Meta/TikTok
  "rastreado",
];

function autorizado(req: NextRequest): boolean {
  const secret = process.env.ES_N8N_SECRET || process.env.ES_CHECKOUT_SECRET || process.env.US_N8N_SECRET || process.env.US_CHECKOUT_SECRET;
  if (!secret) return true; // sem segredo configurado, rota aberta
  const token =
    req.headers.get("x-callback-secret") ??
    req.headers.get("x-checkout-secret") ??
    req.nextUrl.searchParams.get("secret");
  return token === secret;
}

/** Converte a data recebida do n8n, ignorando valor ausente ou inválido */
function parseData(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Campo de texto: grava só se veio preenchido, para não apagar o que já existe */
function txt(v: any): string | undefined {
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

/* ── Vídeo (upsell 2 / downsell com vídeo) ──────────────────────────────
   Mesmos nomes do BR, sem WhatsApp: a entrega aqui é por e-mail. A tabela é
   PedidoVideoEs, 1:1 com PedidoEs; `id` é sempre o id do pedido (cs_ da Stripe). */
const ACOES_VIDEO = [
  "video_dados", "video_renderizando", "video_concluido", "video_erro",
  "video_entregue", "video_email_erro", "video_regerar", "video_rastreado",
];

async function acaoVideo(action: string, id: string, data: any) {
  const nao = (msg: string, status = 400) => NextResponse.json({ success: false, error: msg }, { status });
  if (!ACOES_VIDEO.includes(action)) return nao(`action desconhecida: ${action}. Válidas: ${ACOES_VIDEO.join(", ")}`);

  const video = await prisma.pedidoVideoEs.findUnique({
    where: { pedido_id: id },
    include: { pedido: { select: { nome: true, email: true, link_audio: true, estilo: true, idioma: true, up2_status: true, ds_status: true } } },
  });
  if (!video) return nao(`Pedido ${id} não tem vídeo em PedidoVideoEs (não comprou o upsell 2 nem o downsell com vídeo)`, 404);

  // Tudo que o fluxo de produção precisa numa chamada só
  if (action === "video_dados") {
    const fotos = Array.isArray(video.fotos) ? (video.fotos as any[]) : [];
    return NextResponse.json({
      success: true,
      id: video.pedido_id,
      token: video.token,
      link: linkFotosEs(video.token),          // página de fotos
      ver_link: linkVerVideoEs(video.token),   // página do vídeo pronto (vai no e-mail)
      /* Sempre 'pago': no ES a linha de vídeo só nasce quando a venda libera o
         vídeo (up2, ds2 ou ds3). Vai no corpo porque o nó "Checar" do fluxo é
         o mesmo do BR e exige status === 'pago'. */
      status: "pago",
      producao: video.producao,
      nome: video.pedido.nome,
      email: video.pedido.email,
      idioma: video.pedido.idioma,
      estilo: video.pedido.estilo,
      musica_url: video.pedido.link_audio,
      musica_seg: video.musica_seg != null ? Number(video.musica_seg) : null,
      fotos: fotos.map(f => ({ url: urlPublica(f.path), path: f.path, w: f.w, h: f.h, ordem: f.ordem })),
      opcoes: video.opcoes,
      video_url: urlPublica(video.video_path),
      entrega_email: video.entrega_email,
      erro_msg: video.erro_msg,
      tentativas: video.tentativas,
    });
  }

  // Venda que liberou o vídeo (up2, ds2 ou ds3) registrada na UTMify/Meta/
  // TikTok. Chamado pelos fluxos do up2 e do downsell quando `entregaveis`
  // inclui 'video'. Reenviar é inofensivo: devolve ja_estava.
  if (action === "video_rastreado") {
    // Compatibilidade: marca também a OFERTA que liberou o vídeo (up2, ou o
    // downsell ds2/ds3) — é por ela que o painel conta "sem rastreio".
    const oferta = video.pedido.up2_status === "pago" ? "up2" : "ds";
    const r = await marcarRastreio(id, oferta, true);
    return NextResponse.json({ ...r, oferta });
  }

  let update: any;
  let mensagem: string;
  switch (action) {
    case "video_renderizando":
      update = { producao: "renderizando", erro_msg: null };
      mensagem = "Vídeo em renderização";
      break;
    case "video_concluido":
      update = {
        producao: "concluido", concluido_em: new Date(), erro_msg: null,
        video_path: txt(data.video_path),
        musica_seg: data.musica_seg != null && !isNaN(Number(data.musica_seg)) ? Number(data.musica_seg) : undefined,
      };
      mensagem = "Vídeo concluído";
      break;
    case "video_erro":
      update = { producao: "erro", erro_msg: String(data.erro_msg || "erro sem mensagem").slice(0, 1000), tentativas: { increment: 1 } };
      mensagem = "Erro do vídeo registrado";
      break;
    case "video_entregue":
      update = { entrega_email: true, entregue_em: new Date() };
      mensagem = "E-mail do vídeo marcado como enviado";
      break;
    case "video_email_erro":
      update = { entrega_email: false, erro_msg: `e-mail: ${String(data.erro_msg || "falha no envio").slice(0, 900)}` };
      mensagem = "Falha no e-mail do vídeo registrada";
      break;
    case "video_regerar":
      // Música 1 refeita depois do vídeo pronto: refaz o vídeo sem cobrar
      if (video.producao === "aguardando_fotos") {
        return NextResponse.json({ success: true, skipped: "sem_fotos", message: "Cliente ainda não enviou as fotos" });
      }
      update = { producao: "fotos_enviadas", entrega_email: false, erro_msg: null, concluido_em: null };
      mensagem = "Vídeo voltou pra fila de render";
      break;
    default:
      return nao("action não tratada");
  }

  const v = await prisma.pedidoVideoEs.update({ where: { pedido_id: id }, data: update });
  return NextResponse.json({
    success: true, message: mensagem,
    video: { producao: v.producao, entrega_email: v.entrega_email, video_url: urlPublica(v.video_path), ver_link: linkVerVideoEs(v.token) },
  });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const { action, id } = data;
  if (!id)     return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });
  if (!action) return NextResponse.json({ success: false, error: "action obrigatório" }, { status: 400 });

  // Vídeo (upsell 2): tabela própria, tratado à parte
  if (String(action).startsWith("video_")) {
    /* video_rastreado aceita também o id do PAGAMENTO do vídeo (pi_... do
       up2/ds2/ds3), como no BR, onde o fluxo de rastreio só conhece o id da
       cobrança. O pi_ fica na lista upsell_payment_id do pedido. */
    let pedidoId = String(id);
    if (action === "video_rastreado" && pedidoId.startsWith("pi_")) {
      const dono = await prisma.pedidoEs.findFirst({ where: { upsell_payment_id: { contains: pedidoId } }, select: { id: true } });
      if (!dono) return NextResponse.json({ success: false, error: "Nenhum pedido com esse pagamento" }, { status: 404 });
      pedidoId = dono.id;
    }
    return acaoVideo(String(action), pedidoId, data);
  }

  if (!ACOES.includes(action)) {
    return NextResponse.json(
      { success: false, error: `action desconhecida: ${action}. Válidas: ${ACOES.join(", ")}, ${ACOES_VIDEO.join(", ")}` },
      { status: 400 },
    );
  }

  let update: any;
  let mensagem: string;

  /* A música que já estava gravada, pra saber se este music_ready é a primeira
     geração ou uma REGENERAÇÃO (link_audio diferente). Na regeneração a página
     Premium ganha link novo e o vídeo precisa ser refeito com o MP3 novo. */
  const antes = action === "music_ready"
    ? await prisma.pedidoEs.findUnique({ where: { id }, select: { link_audio: true } })
    : null;

  switch (action) {
    /* ── Fluxo 1: venda inicial (música 1) ── */

    case "music_ready":
      update = {
        gerou_musica: true,
        erro_geracao: false,
        song_id:      txt(data.song_id),
        link_pagina:  txt(data.link_pagina),
        link_basica:  txt(data.link_basica),
        link_audio:   txt(data.link_audio),
        link_mp4:     txt(data.link_mp4),
        data_entrega: parseData(data.data_entrega),
      };
      mensagem = "Música 1 marcada como gerada";
      break;

    case "email_entregue":
      update = { entrega_email: true, data_entrega: parseData(data.data_entrega) };
      mensagem = "Entrega principal marcada como entregue";
      break;

    case "email_erro":
      update = { entrega_email: false };
      mensagem = "Entrega principal marcada como erro";
      break;

    case "erro_geracao":
      update = { gerou_musica: false, erro_geracao: true };
      mensagem = "Erro de geração da música 1 registrado";
      break;

    /* ── Fluxo da página Premium ── */

    case "pagina_entregue":
      update = {
        pagina_entrega_email: true,
        pagina_data_entrega: parseData(data.pagina_data_entrega ?? data.data_entrega),
      };
      mensagem = "Página Premium marcada como entregue";
      break;

    case "pagina_erro":
      update = { pagina_entrega_email: false };
      mensagem = "Entrega da página Premium marcada como erro";
      break;

    /* ── Fluxo 3: upsell 2 (músicas 2 e 3) ── */

    case "up_music_ready":
      // Aceita as duas músicas numa chamada só, ou uma por vez —
      // os campos ausentes não sobrescrevem o que já estiver gravado.
      update = {
        up_gerou_musica: true,
        up_erro_geracao: false,
        song_id2:     txt(data.song_id2),
        link_pagina2: txt(data.link_pagina2),
        link_basica2: txt(data.link_basica2),
        link_audio2:  txt(data.link_audio2),
        song_id3:     txt(data.song_id3),
        link_pagina3: txt(data.link_pagina3),
        link_basica3: txt(data.link_basica3),
        link_audio3:  txt(data.link_audio3),
        up_data_entrega: parseData(data.up_data_entrega ?? data.data_entrega),
      };
      mensagem = "Músicas extras marcadas como geradas";
      break;

    case "up_email_entregue":
      update = {
        up_entrega_email: true,
        up_data_entrega: parseData(data.up_data_entrega ?? data.data_entrega),
      };
      mensagem = "Entrega das músicas extras marcada como entregue";
      break;

    case "up_email_erro":
      update = { up_entrega_email: false };
      mensagem = "Entrega das músicas extras marcada como erro";
      break;

    case "up_erro_geracao":
      update = { up_gerou_musica: false, up_erro_geracao: true };
      mensagem = "Erro de geração das músicas extras registrado";
      break;

    /* ── Rastreio: venda registrada na UTMify/Meta/TikTok, POR OFERTA ──
       { action: "rastreado", id, oferta: "front"|"up1"|"up2"|"ds1"|"ds2"|"ds3" }
       Sem `oferta` = frente (compatível com o fluxo antigo).
       `rastreado: false` no corpo desmarca (pra reprocessar). */
    case "rastreado":
      return NextResponse.json(await marcarRastreio(id, String(data.oferta || "front"), data.rastreado !== false));

    default:
      return NextResponse.json({ success: false, error: "action não tratada" }, { status: 400 });
  }

  try {
    const pedido = await prisma.pedidoEs.update({
      where: { id },
      data: update,
      select: {
        id: true, plano: true, status: true,
        up1_status: true, up2_status: true, ds_status: true,
        gerou_musica: true, erro_geracao: true, entrega_email: true,
        pagina_entrega_email: true,
        up_gerou_musica: true, up_erro_geracao: true, up_entrega_email: true,
      },
    });

    // Repetido aqui para o fluxo poder ramificar sem consultar o checkout de novo
    const lib = liberacoes(pedido);

    /* Música pronta → ofertas que dependem dela (ver lib/video-es-producao.ts):
         1ª geração:  vídeo sai se as fotos já chegaram; página sai se já foi comprada
         regeneração: vídeo refeito com as mesmas fotos; página reenviada com o link novo */
    let video_disparo: string | undefined;
    let pagina_disparo: string | undefined;
    if (action === "music_ready") {
      const novo = txt(data.link_audio);
      const regenerada = Boolean(antes?.link_audio && novo && novo !== antes.link_audio);
      if (lib.video)  video_disparo  = regenerada ? await refazerVideoEs(id) : await dispararProducaoVideoEs(id);
      if (lib.pagina) pagina_disparo = await dispararPaginaEs(id, regenerada);
    }

    return NextResponse.json({
      success: true, message: mensagem, pedido, entrega_pagina: lib.pagina, entrega_video: lib.video,
      ...(video_disparo ? { video_disparo } : {}), ...(pagina_disparo ? { pagina_disparo } : {}),
    });
  } catch (e: any) {
    if (e?.code === "P2025") {
      // Sintoma clássico de ter apontado o nó para a operação errada
      return NextResponse.json(
        { success: false, error: `Pedido ${id} não encontrado em PedidoEs (operação ES (LATAM))` },
        { status: 404 },
      );
    }
    console.error("[us/n8n callback]", e);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
