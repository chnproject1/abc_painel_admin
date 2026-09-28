import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Aciona os fluxos n8n da operação ES (LATAM) a partir do painel.
 *
 *   POST /api/es/trigger/<id>   body: { "tipo": "principal" | "upsell" | "envio", "alvo"?: ... }
 *
 * Uma rota só, com o fluxo escolhido pelo `tipo`, porque as três fazem a mesma
 * coisa: confere que o pedido existe em PedidoEs e repassa o id ao webhook.
 *
 * Se a variável de ambiente do fluxo não existir, devolve "Webhook não
 * configurado" em vez de quebrar — mesmo comportamento do /api/trigger do BR.
 */

/* Todo disparo manda `pedido_id` E `payment_id` com o mesmo valor, e o `tipo`.
   O funil da Netlify usa `payment_id` no fluxo 1 e `pedido_id` no de upsell
   (onde `payment_id` e o pi_ da Stripe). Mandando os dois, qualquer fluxo
   funciona lendo o nome que preferir — e nao existe mais chamada que quebra
   por causa do campo errado. */
const FLUXOS = {
  // Gera a música principal (venda inicial)
  principal: {
    env: "ES_N8N_WEBHOOK_URL",
    corpo: (id: string) => ({ pedido_id: id, payment_id: id, tipo: "principal" }),
  },
  // Gera as duas músicas extras (upsell 2 ou downsell/combo)
  upsell: {
    env: "ES_N8N_UPSELL_WEBHOOK_URL",
    corpo: (id: string) => ({ pedido_id: id, payment_id: id, tipo: "upsell" }),
  },
  // Reenvia tudo o que já foi gerado, sem passar pela Suno
  envio: {
    env: "ES_N8N_ENVIO_WEBHOOK_URL",
    corpo: (id: string) => ({ payment_id: id, pedido_id: id, tipo: "envio" }),
  },
  // Vídeo (upsell 2): manda pra produção de novo com as fotos que já estão lá
  video: {
    env: "ES_N8N_VIDEO_WEBHOOK_URL",
    corpo: (id: string) => ({ pedido_id: id, payment_id: id, tipo: "video" }),
  },
} as const;

type Tipo = keyof typeof FLUXOS;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // corpo vazio é aceito; cai no padrão abaixo
  }

  const tipo: Tipo = body?.tipo ?? "principal";
  if (!(tipo in FLUXOS)) {
    return NextResponse.json(
      { error: `tipo inválido: ${tipo}. Válidos: ${Object.keys(FLUXOS).join(", ")}` },
      { status: 400 },
    );
  }

  const pedido = await prisma.pedidoEs.findUnique({
    where: { id },
    select: { id: true, up1_status: true, up2_status: true, ds_status: true, video: { select: { producao: true } } },
  });

  if (!pedido) {
    return NextResponse.json(
      { error: `Pedido ${id} não encontrado em PedidoEs (operação ES (LATAM))` },
      { status: 404 },
    );
  }

  // Não faz sentido gerar as extras de quem não comprou o upsell 2 nem o combo
  if (tipo === "upsell" && pedido.up2_status !== "pago" && pedido.ds_status !== "pago") {
    return NextResponse.json(
      { error: "Este pedido não comprou o upsell 2 nem o downsell — não há músicas extras a gerar" },
      { status: 409 },
    );
  }

  if (tipo === "video") {
    if (!pedido.video) {
      return NextResponse.json({ error: "Este pedido não tem vídeo (não comprou o upsell 2 nem o downsell com vídeo)" }, { status: 409 });
    }
    if (pedido.video.producao === "aguardando_fotos") {
      return NextResponse.json({ error: "O cliente ainda não enviou as fotos — não há o que renderizar" }, { status: 409 });
    }
    // Volta pra fila antes de chamar o n8n, como o video_regerar do BR
    await prisma.pedidoVideoEs.update({
      where: { pedido_id: id },
      data: { producao: "fotos_enviadas", entrega_email: false, erro_msg: null, concluido_em: null },
    });
  }

  const fluxo = FLUXOS[tipo];
  // ES_* é o nome novo; o US_* antigo continua valendo até a troca no Easypanel
  const webhookUrl = process.env[fluxo.env] || process.env[fluxo.env.replace(/^ES_/, "US_")];
  if (!webhookUrl) {
    return NextResponse.json(
      { error: `Webhook não configurado (falta a variável ${fluxo.env})` },
      { status: 500 },
    );
  }

  const corpo = fluxo.corpo(pedido.id);

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Não foi possível alcançar o n8n: ${e?.message ?? "erro de rede"}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "O n8n recusou a chamada", status: response.status },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, tipo, id: pedido.id, enviado: corpo });
}
