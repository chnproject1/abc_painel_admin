import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_id: pedido.id }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Erro ao acionar n8n", status: response.status }, { status: 502 });
  }

  return NextResponse.json({ ok: true, payment_id: pedido.id });
}
