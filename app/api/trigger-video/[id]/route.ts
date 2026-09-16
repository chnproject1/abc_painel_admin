import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estadoVideo } from "@/lib/video-estado";

/*
  Botão "Refazer vídeo" do painel: devolve o pedido pra fila de render.

  Não dispara webhook — o fluxo de render pega quem está `pago` +
  `fotos_enviadas`, o mesmo caminho da primeira vez. É o equivalente com
  sessão do `video_regerar` de /api/n8n, que exige o segredo do callback
  e por isso não serve pro navegador.

  Quem decide se pode é o `estadoVideo`, o mesmo que pinta o card. Assim
  o botão e a rota nunca discordam: o card só mostra o botão no estado
  "erro", e a rota só aceita nesse estado. Isso cobre de graça os dois
  erros que não são `producao = 'erro'` — o render travado em
  "renderizando" e o pagamento que a fila nunca pegou.
*/
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const video = await prisma.pedidoVideo.findUnique({
    where: { pedido_id: id },
    select: {
      status: true, producao: true, entrega_whatsapp: true, erro_msg: true,
      atualizado_em: true, pago_em: true, concluido_em: true, fotos_em: true,
    },
  });

  if (!video) return NextResponse.json({ error: "Este pedido não tem vídeo" }, { status: 404 });

  if (video.status !== "pago") {
    return NextResponse.json({ error: "O vídeo não foi pago" }, { status: 409 });
  }

  const estado = estadoVideo(video);
  if (estado.chave !== "erro") {
    /* Sem isto, dois cliques seguidos (ou duas abas) enfileirariam o mesmo
       pedido duas vezes e o cliente receberia dois vídeos. */
    return NextResponse.json(
      { error: `Só dá pra refazer um vídeo com erro. Estado atual: ${estado.rotulo}.` },
      { status: 409 },
    );
  }

  await prisma.pedidoVideo.update({
    where: { pedido_id: id },
    data: {
      producao: "fotos_enviadas",
      erro_msg: null,
      concluido_em: null,
      /* Um render novo invalida o que porventura já tenha sido entregue. */
      entrega_whatsapp: false,
    },
  });

  return NextResponse.json({ ok: true });
}
