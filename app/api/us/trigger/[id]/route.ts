import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Aciona os fluxos n8n da operação US a partir do painel.
 *
 *   POST /api/us/trigger/<id>   body: { "tipo": "principal" | "upsell" | "envio", "alvo"?: ... }
 *
 * Uma rota só, com o fluxo escolhido pelo `tipo`, porque as três fazem a mesma
 * coisa: confere que o pedido existe em PedidoUs e repassa o id ao webhook.
 *
 * Se a variável de ambiente do fluxo não existir, devolve "Webhook não
 * configurado" em vez de quebrar — mesmo comportamento do /api/trigger do BR.
 */

const FLUXOS = {
  // Gera a música principal (venda inicial)
  principal: {
    env: "US_N8N_WEBHOOK_URL",
    corpo: (id: string) => ({ payment_id: id }),
  },
  // Gera as duas músicas extras (upsell 2 ou downsell/combo)
  upsell: {
    env: "US_N8N_UPSELL_WEBHOOK_URL",
    // Manda os dois nomes: o fluxo do upsell lê `pedido_id`, mas o payload
    // que a Netlify envia também traz `payment_id`, então os dois resolvem.
    corpo: (id: string) => ({ pedido_id: id, payment_id: id, tipo: "upsell" }),
  },
  // Reenvia tudo o que já foi gerado, sem passar pela Suno
  envio: {
    env: "US_N8N_ENVIO_WEBHOOK_URL",
    corpo: (id: string) => ({ payment_id: id, pedido_id: id, tipo: "envio" }),
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

  const pedido = await prisma.pedidoUs.findUnique({
    where: { id },
    select: { id: true, up2_status: true, ds_status: true },
  });

  if (!pedido) {
    return NextResponse.json(
      { error: `Pedido ${id} não encontrado em PedidoUs (operação US)` },
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

  const fluxo = FLUXOS[tipo];
  const webhookUrl = process.env[fluxo.env];
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
