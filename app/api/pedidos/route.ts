import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LIMIT = 50;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const filtro     = req.nextUrl.searchParams.get("filtro") ?? "todos";
  const page       = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const dataParam  = req.nextUrl.searchParams.get("data");   // YYYY-MM-DD  (dia exato)
  const desdeParam = req.nextUrl.searchParams.get("desde"); // ISO datetime (a partir de)
  const planoParam = req.nextUrl.searchParams.get("plano"); // nome do plano

  const where: Record<string, unknown> = {};

  switch (filtro) {
    case "pagos":
      where.status = "pago";
      break;
    case "pendentes":
      where.status = "pago";
      where.entrega_whatsapp = false;
      where.entrega_email = false;
      break;
    case "erro":
      where.status = "pago";
      where.gerou_musica = false;
      break;
  }

  if (dataParam) {
    where.data_pedido = {
      gte: new Date(`${dataParam}T00:00:00.000Z`),
      lte: new Date(`${dataParam}T23:59:59.999Z`),
    };
  } else if (desdeParam) {
    // Front envia com offset BRT: "2026-05-07T18:40:00-03:00"
    where.data_pedido = { gte: new Date(desdeParam) };
  }

  if (planoParam) {
    where.plano = planoParam;
  }

  const [pedidos, total] = await Promise.all([
    prisma.pedido.findMany({
      where,
      select: {
        id: true,
        nome: true,
        telefone: true,
        email: true,
        plano: true,
        status: true,
        estilo: true,
        gerou_musica: true,
        link_audio: true,
        link_pagina: true,
        data_entrega: true,
        data_pedido: true,
        entrega_whatsapp: true,
        entrega_email: true,
      },
      orderBy: { data_pedido: "asc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.pedido.count({ where }),
  ]);

  return NextResponse.json({ pedidos, total, page, pages: Math.ceil(total / LIMIT) });
}
