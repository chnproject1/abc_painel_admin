import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [total, pagos, pendentes_envio, erro_geracao] = await Promise.all([
    // Total que iniciaram checkout
    prisma.pedido.count(),

    // Pagaram
    prisma.pedido.count({ where: { status: "pago" } }),

    // Pagaram e NÃO foram entregues (inclui com erro, pois também não enviados)
    prisma.pedido.count({
      where: {
        status: "pago",
        entrega_whatsapp: false,
        entrega_email: false,
      },
    }),

    // Pagaram mas música não foi gerada (erro_geracao OU coluna vazia = gerou_musica false)
    prisma.pedido.count({
      where: {
        status: "pago",
        gerou_musica: false,
      },
    }),
  ]);

  return NextResponse.json({ total, pagos, pendentes_envio, erro_geracao });
}
