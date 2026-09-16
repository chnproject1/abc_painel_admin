import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estadoVideo } from "@/lib/video-estado";

/*
  Botão "Refazer vídeo" do painel: manda o pedido pra produção de novo.

  Não existe fila que varre a tabela — o render só começa quando alguém
  chama o `Webhook - Vídeo Pago` do n8n (path `video-producao`), o mesmo
  que o pagamento dispara. Mexer só no banco não acorda ninguém.

  A ordem importa: primeiro limpa a linha, depois chama o n8n. Ao contrário,
  o fluxo já teria gravado `renderizando` e o nosso update jogaria de volta
  pra `fotos_enviadas`, matando o render que acabou de começar.

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

  const webhookUrl = process.env.N8N_WEBHOOK_VIDEO_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "N8N_WEBHOOK_VIDEO_URL não configurada" }, { status: 500 });
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

  let resposta: Response;
  try {
    resposta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido_id: id }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    await marcarFalha(id, `não consegui chamar o n8n: ${e?.message ?? e}`);
    return NextResponse.json({ error: "O n8n não respondeu. Tente de novo." }, { status: 502 });
  }

  if (!resposta.ok) {
    await marcarFalha(id, `o n8n respondeu ${resposta.status} ao iniciar o render`);
    return NextResponse.json({ error: `O n8n recusou (${resposta.status}).` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/* Se o n8n não aceitou, a linha não pode ficar em `fotos_enviadas`: ela
   passaria 20 minutos mostrando "aguardando render" enquanto ninguém está
   renderizando. Volta pro erro com o motivo verdadeiro, que é o que o card
   mostra. */
async function marcarFalha(id: string, motivo: string) {
  await prisma.pedidoVideo.update({
    where: { pedido_id: id },
    data: { producao: "erro", erro_msg: motivo.slice(0, 1000) },
  }).catch(() => null);
}
