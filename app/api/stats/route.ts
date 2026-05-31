import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Somente pedidos a partir do início da automação são contabilizados nos stats
// Registros anteriores ficam no banco mas não afetam os indicadores
const INICIO_AUTOMACAO = new Date("2026-05-07T21:40:21.000Z"); // 07/05/2026 18:40:21 BRT

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const filtroBase = { data_pedido: { gte: INICIO_AUTOMACAO } };

  const [total, pagos, pendentes_envio, erro_geracao] = await Promise.all([
    // Total que iniciaram checkout
    prisma.pedido.count({ where: filtroBase }),

    // Pagaram
    prisma.pedido.count({ where: { ...filtroBase, status: "pago" } }),

    // Pagaram e NÃO foram entregues
    prisma.pedido.count({
      where: {
        ...filtroBase,
        status: "pago",
        entrega_whatsapp: false,
        entrega_email: false,
      },
    }),

    // Pagaram mas música não foi gerada
    prisma.pedido.count({
      where: {
        ...filtroBase,
        status: "pago",
        gerou_musica: false,
      },
    }),
  ]);

  return NextResponse.json({ total, pagos, pendentes_envio, erro_geracao });
}
