import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TOKEN_RE, validarFotos } from "@/lib/video";

/*
  API da tabela PedidoVideoEs pras páginas /fotos-es e /video-es.

  Mesmo desenho do /api/video do BR: quem chama é o servidor da página
  (funções da Netlify), nunca o navegador, com o segredo em x-video-secret.
  Identificação sempre pelo token. O id da Stripe nunca sai daqui.

  Diferenças do BR: não existe venda aqui (o vídeo já foi pago no funil),
  então não tem `status`, nem `pix`, nem escolha de outra música. A música
  do vídeo é sempre a música 1 do pedido.
*/

function erro(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

function autorizado(req: NextRequest) {
  const secret = process.env.VIDEO_API_SECRET;
  if (!secret) return false;
  return req.headers.get("x-video-secret") === secret;
}

function tokenDe(valor: string | null) {
  const t = String(valor || "");
  return TOKEN_RE.test(t) ? t : null;
}

function serializar(v: any) {
  return {
    producao:      v.producao,
    fotos:         v.fotos,
    opcoes:        v.opcoes,
    video_path:    v.video_path,
    entrega_email: v.entrega_email,
    erro_msg:      v.erro_msg,
    aberto_em:     v.aberto_em,
    fotos_em:      v.fotos_em,
    concluido_em:  v.concluido_em,
    cliente: {
      nome:     v.pedido.nome,
      email:    v.pedido.email,
      musica:   v.pedido.link_audio,   // música 1: é ela que vira vídeo
      pixel_id: v.pedido.pixel_id,
      idioma:   v.pedido.idioma,
    },
  };
}

// GET ?t=TOKEN — estado do vídeo. Marca aberto_em na primeira vez.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return erro("Não autorizado", 401);
  const t = tokenDe(req.nextUrl.searchParams.get("t"));
  if (!t) return erro("token inválido", 404);

  const video = await prisma.pedidoVideoEs.findUnique({
    where: { token: t },
    include: { pedido: { select: { nome: true, email: true, link_audio: true, pixel_id: true, idioma: true } } },
  });
  if (!video) return erro("token inválido", 404);

  if (!video.aberto_em) {
    await prisma.pedidoVideoEs.update({ where: { token: t }, data: { aberto_em: new Date() } }).catch(() => null);
    video.aberto_em = new Date();
  }

  return NextResponse.json({ success: true, video: serializar(video) });
}

// POST { t, acao, ... }
//   fotos   → grava fotos/opções, producao = fotos_enviadas
//   refazer → volta pra aguardando_fotos (só antes de renderizar, ou depois de erro)
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return erro("Não autorizado", 401);

  let data: any;
  try { data = await req.json(); } catch { return erro("JSON inválido"); }

  const t = tokenDe(data.t);
  if (!t) return erro("token inválido", 404);

  const video = await prisma.pedidoVideoEs.findUnique({ where: { token: t } });
  if (!video) return erro("token inválido", 404);

  const acao = String(data.acao || "");

  if (acao === "fotos") {
    // Antes do render: qualquer estado. Depois: só se deu erro, pra trocar a foto que quebrou.
    const pode = ["aguardando_fotos", "fotos_enviadas", "erro"].includes(video.producao);
    if (!pode) return erro(`não dá pra trocar as fotos com producao=${video.producao}`, 409);

    const v = validarFotos(data.fotos, t);
    if (!v.ok) return erro(v.erro);

    const opcoes = data.opcoes && typeof data.opcoes === "object" ? { card_nome: Boolean(data.opcoes.card_nome) } : {};

    const atualizado = await prisma.pedidoVideoEs.update({
      where: { token: t },
      data: { fotos: v.fotos, opcoes, fotos_em: new Date(), producao: "fotos_enviadas", erro_msg: null },
    });
    return NextResponse.json({ success: true, producao: atualizado.producao, fotos_qtd: v.fotos.length });
  }

  if (acao === "refazer") {
    if (!["fotos_enviadas", "erro"].includes(video.producao)) return erro("o vídeo já está em produção", 409);
    const atualizado = await prisma.pedidoVideoEs.update({ where: { token: t }, data: { producao: "aguardando_fotos" } });
    return NextResponse.json({ success: true, producao: atualizado.producao });
  }

  return erro(`acao desconhecida: ${acao}`);
}
