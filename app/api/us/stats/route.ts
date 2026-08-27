import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// A operação US nasce junto com o portal, então não existe corte de data
// como o INICIO_AUTOMACAO da operação BR.
/* Uma entrega pendente é qualquer coisa que o cliente comprou e ainda não
 * recebeu: a música principal, ou as extras do upsell 2 / downsell. */
const PENDENTE = {
  status: "pago",
  OR: [
    { entrega_email: false },
    { AND: [{ OR: [{ up1_status: "pago" }, { ds_status: "pago" }] }, { pagina_entrega_email: false }] },
    { AND: [{ OR: [{ up2_status: "pago" }, { ds_status: "pago" }] }, { up_entrega_email: false }] },
  ],
};

/* Erro de geração é qualquer música comprada que não foi gerada e continua
 * sem ser entregue. */
const ERRO = {
  status: "pago",
  OR: [
    { gerou_musica: false, entrega_email: false },
    { AND: [{ OR: [{ up2_status: "pago" }, { ds_status: "pago" }] }, { up_gerou_musica: false, up_entrega_email: false }] },
  ],
};

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
    recInicial,
    recUp1,
    recUp2,
    recDs,
  ] = await Promise.all([
    // Iniciaram o checkout
    prisma.pedidoUs.count(),

    // Pagaram a venda inicial
    prisma.pedidoUs.count({ where: { status: "pago" } }),

    // Aceitaram cada oferta do funil
    prisma.pedidoUs.count({ where: { up1_status: "pago" } }),
    prisma.pedidoUs.count({ where: { up2_status: "pago" } }),
    prisma.pedidoUs.count({ where: { ds_status: "pago" } }),

    // Falta alguma entrega — principal ou extras
    prisma.pedidoUs.count({ where: PENDENTE }),

    // Alguma geração falhou — principal ou extras
    prisma.pedidoUs.count({ where: ERRO }),

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

    /* Faturamento por oferta. Cada valor só conta quando A SUA oferta foi
       paga: o `valor` é gravado na criação do pedido, então somar sem
       filtro faria carrinho abandonado aparecer como receita. Por isso são
       quatro consultas e não um aggregate só — os status são diferentes. */
    prisma.pedidoUs.aggregate({ where: { status: "pago" },     _sum: { valor: true } }),
    prisma.pedidoUs.aggregate({ where: { up1_status: "pago" }, _sum: { up1_valor: true } }),
    prisma.pedidoUs.aggregate({ where: { up2_status: "pago" }, _sum: { up2_valor: true } }),
    prisma.pedidoUs.aggregate({ where: { ds_status: "pago" },  _sum: { ds_valor: true } }),
  ]);

  const soma = (v: unknown) => Number(v ?? 0);

  const receitaInicial = soma(recInicial._sum.valor);
  const receitaUp1     = soma(recUp1._sum.up1_valor);
  const receitaUp2     = soma(recUp2._sum.up2_valor);
  const receitaDs      = soma(recDs._sum.ds_valor);
  const receita_total  = receitaInicial + receitaUp1 + receitaUp2 + receitaDs;

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
      inicial: receitaInicial,
      up1:     receitaUp1,
      up2:     receitaUp2,
      ds:      receitaDs,
      total:   receita_total,
    },
  });
}
