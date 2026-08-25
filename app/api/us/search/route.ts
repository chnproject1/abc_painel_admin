import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectPorRoleUs } from "@/lib/columns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) return NextResponse.json({ error: "Informe um email ou ID do pedido" }, { status: 400 });

  const role = (session.user as any).role ?? "OPERADOR";

  // A operação US não coleta telefone, então a busca é por email ou pelo ID do pedido
  const pedidos = await prisma.pedidoUs.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
      ],
    },
    select: selectPorRoleUs(role),
    orderBy: { criado_em: "desc" },
    take: 50,
  });

  return NextResponse.json(pedidos);
}
