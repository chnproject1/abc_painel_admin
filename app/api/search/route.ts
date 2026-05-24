import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectPorRole } from "@/lib/columns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) return NextResponse.json({ error: "Informe um telefone ou email" }, { status: 400 });

  const role = (session.user as any).role ?? "OPERADOR";
  const apenasNumeros = q.replace(/\D/g, "");

  const pedidos = await prisma.pedido.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        ...(apenasNumeros ? [{ telefone: { contains: apenasNumeros } }] : []),
      ],
    },
    select: selectPorRole(role),
    orderBy: { criado_em: "desc" },
    take: 50,
  });

  return NextResponse.json(pedidos);
}
