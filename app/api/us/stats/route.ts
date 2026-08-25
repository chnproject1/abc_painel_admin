import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// A operação US nasce junto com o portal, então não existe corte de data
// como o INICIO_AUTOMACAO da operação BR.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [
    total,
    pagos,
    up1,
    up2,
    ds,
    pendentes_envio,
    erro_geracao,
    pendentes_envio_up,
    erro_geracao_up,
    receita,
  ] = await Promise.all([
    // Iniciaram o checkout
    prisma.pedidoUs.count(),

    // Pagaram a venda inicial
    prisma.pedidoUs.count({ where: { status: "pago" } }),

    // Aceitaram cada oferta do funil
    prisma.pedidoUs.count({ where: { up1_status: "pago" } }),
    prisma.pedidoUs.count({ where: { up2_status: "pago" } }),
    prisma.pedidoUs.count({ where: { ds_status: "pago" } }),

    // Entrega principal: pagou e ainda não recebeu
    prisma.pedidoUs.count({ where: { status: "pago", entrega_email: false } }),

    // Entrega principal: pagou, música não gerada e ainda não entregue
    prisma.pedidoUs.count({
      where: { status: "pago", gerou_musica: false, entrega_email: false },
    }),

    // Entrega do upsell 2: comprou as músicas extras e ainda não recebeu
    prisma.pedidoUs.count({
      where: { OR: [{ up2_status: "pago" }, { ds_status: "pago" }], up_entrega_email: false },
    }),

    // Entrega do upsell 2: comprou, músicas não geradas e ainda não entregues
    prisma.pedidoUs.count({
      where: {
        OR: [{ up2_status: "pago" }, { ds_status: "pago" }],
        up_gerou_musica: false,
        up_entrega_email: false,
      },
    }),

    // Faturamento somado das quatro ofertas
    prisma.pedidoUs.aggregate({
      _sum: { valor: true, up1_valor: true, up2_valor: true, ds_valor: true },
    }),
  ]);

  const soma = (v: unknown) => Number(v ?? 0);
  const receita_total =
    soma(receita._sum.valor) +
    soma(receita._sum.up1_valor) +
    soma(receita._sum.up2_valor) +
    soma(receita._sum.ds_valor);

  return NextResponse.json({
    total,
    pagos,
    up1,
    up2,
    ds,
    pendentes_envio,
    erro_geracao,
    pendentes_envio_up,
    erro_geracao_up,
    receita: {
      inicial: soma(receita._sum.valor),
      up1:     soma(receita._sum.up1_valor),
      up2:     soma(receita._sum.up2_valor),
      ds:      soma(receita._sum.ds_valor),
      total:   receita_total,
    },
  });
}
