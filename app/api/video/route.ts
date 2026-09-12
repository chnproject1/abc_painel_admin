import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TOKEN_RE, validarFotos, extrairUtm, gerarToken } from "@/lib/video";

/*
  API da tabela PedidoVideo pra página /upvideo.

  Quem chama é o servidor da página (hoje o container no Easypanel, depois
  as funções da Netlify), nunca o navegador. Por isso a proteção é um
  segredo no header x-video-secret, e a resposta pode trazer telefone e
  e-mail: o servidor da página usa pra gerar o PIX e não repassa ao cliente.

  Identificação sempre pelo token do link. O pix_char nunca sai daqui.
*/

function erro(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

function autorizado(req: NextRequest) {
  const secret = process.env.VIDEO_API_SECRET;
  if (!secret) return false;   // sem segredo configurado a rota fica fechada
  return req.headers.get("x-video-secret") === secret;
}

function tokenDe(valor: string | null) {
  const t = String(valor || "");
  return TOKEN_RE.test(t) ? t : null;
}

function serializar(v: any) {
  return {
    status:           v.status,
    producao:         v.producao,
    fotos:            v.fotos,
    opcoes:           v.opcoes,
    video_path:       v.video_path,
    whatsapp_path:    v.whatsapp_path,
    valor:            v.valor != null ? Number(v.valor) : null,
    pagamento_id:     v.pagamento_id,
    entrega_whatsapp: v.entrega_whatsapp,
    erro_msg:         v.erro_msg,
    enviado_em:       v.enviado_em,
    aberto_em:        v.aberto_em,
    fotos_em:         v.fotos_em,
    pago_em:          v.pago_em,
    concluido_em:     v.concluido_em,
    cliente: {
      nome:     v.pedido.nome,
      telefone: v.pedido.telefone,
      email:    v.pedido.email,
      cpf:      v.pedido.cpf,
      musica:   v.pedido.link_audio,
      pixel_id: v.pedido.pixel_id,   // pixel da compra da música: a página carrega Meta ou TikTok conforme ele
    },
  };
}

// GET ?t=TOKEN — estado do pedido de vídeo. Marca aberto_em na primeira vez.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return erro("Não autorizado", 401);
  const t = tokenDe(req.nextUrl.searchParams.get("t"));
  if (!t) return erro("token inválido", 404);

  const video = await prisma.pedidoVideo.findUnique({
    where: { token: t },
    include: { pedido: { select: { nome: true, telefone: true, email: true, cpf: true, link_audio: true, pixel_id: true } } },
  });
  if (!video) return erro("token inválido", 404);

  if (!video.aberto_em) {
    await prisma.pedidoVideo.update({ where: { token: t }, data: { aberto_em: new Date() } }).catch(() => null);
    video.aberto_em = new Date();
  }

  return NextResponse.json({ success: true, video: serializar(video), outras: await outrasMusicas(video) });
}

/* Marketing pra quem já comprou: um cliente pode ter mais de uma música, e a
   mensagem só leva um link. A página então oferece a escolha. Aqui listamos
   as outras músicas pagas e entregues do mesmo telefone, cada uma com a
   própria linha de vídeo (criada na hora se ainda não existir, sem
   enviado_em, porque ninguém mandou link pra ela). Só sai o token, o nome e
   a música — o pix_char nunca vai pra página. */
async function outrasMusicas(video: { pedido_id: string; pedido: { telefone: string } }) {
  const telefone = (video.pedido.telefone || "").replace(/\D/g, "");
  if (telefone.length < 10) return [];

  const pedidos = await prisma.pedido.findMany({
    where: {
      telefone,
      id: { not: video.pedido_id },
      status: "pago",
      gerou_musica: true,
      link_audio: { not: null },
    },
    orderBy: { data_pedido: "desc" },
    take: 10,
    select: { id: true, nome: true, estilo: true, link_audio: true, video: { select: { token: true, status: true, producao: true } } },
  });

  const outras = [];
  for (const p of pedidos) {
    let v = p.video;
    if (!v) {
      v = await prisma.pedidoVideo.create({
        data: { pedido_id: p.id, token: gerarToken() },
        select: { token: true, status: true, producao: true },
      });
    }
    outras.push({ token: v.token, nome: p.nome, estilo: p.estilo, musica: p.link_audio, status: v.status, producao: v.producao });
  }
  return outras;
}

// POST { t, acao, ... }
//   fotos   → grava fotos/opções/UTMs, producao = fotos_enviadas
//   refazer → volta pra aguardando_fotos (só antes de pagar)
//   pix     → grava o PIX gerado pro vídeo (pagamento_id, valor)
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return erro("Não autorizado", 401);

  let data: any;
  try { data = await req.json(); } catch { return erro("JSON inválido"); }

  const t = tokenDe(data.t);
  if (!t) return erro("token inválido", 404);

  const video = await prisma.pedidoVideo.findUnique({ where: { token: t } });
  if (!video) return erro("token inválido", 404);

  const acao = String(data.acao || "");

  if (acao === "fotos") {
    // Antes de pagar: qualquer estado. Depois de pagar: só se deu erro no
    // render, pra pessoa poder trocar a foto que quebrou.
    const pode = video.status === "pendente" || video.producao === "erro";
    if (!pode) return erro(`não dá pra trocar as fotos com producao=${video.producao}`, 409);

    const v = validarFotos(data.fotos, t);
    if (!v.ok) return erro(v.erro);

    const opcoes = data.opcoes && typeof data.opcoes === "object" ? { card_nome: Boolean(data.opcoes.card_nome) } : {};

    const atualizado = await prisma.pedidoVideo.update({
      where: { token: t },
      data: {
        fotos:    v.fotos,
        opcoes,
        fotos_em: new Date(),
        producao: "fotos_enviadas",
        erro_msg: null,
        ...extrairUtm(data.utm),
      },
    });
    return NextResponse.json({ success: true, status: atualizado.status, producao: atualizado.producao, fotos_qtd: v.fotos.length });
  }

  if (acao === "refazer") {
    if (video.status !== "pendente") return erro("pedido já pago", 409);
    const atualizado = await prisma.pedidoVideo.update({
      where: { token: t },
      data: { producao: "aguardando_fotos" },
    });
    return NextResponse.json({ success: true, status: atualizado.status, producao: atualizado.producao });
  }

  if (acao === "pix") {
    if (video.status !== "pendente") return erro("pedido já pago", 409);
    if (video.producao !== "fotos_enviadas") return erro("envie as fotos antes de pagar", 409);
    const pagamento_id = String(data.pagamento_id || "");
    if (!/^pix_char_[A-Za-z0-9]+$/.test(pagamento_id)) return erro("pagamento_id inválido");
    const valor = Number(data.valor);
    if (!(valor > 0)) return erro("valor inválido");

    // PIX que expirou e foi gerado de novo simplesmente sobrescreve; só o último vale.
    await prisma.pedidoVideo.update({
      where: { token: t },
      data: { pagamento_id, valor },
    });
    return NextResponse.json({ success: true, pagamento_id });
  }

  return erro(`acao desconhecida: ${acao}`);
}
