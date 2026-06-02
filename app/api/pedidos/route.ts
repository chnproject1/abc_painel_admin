import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LIMIT = 50;

// Registros anteriores a esta data ficam no banco mas não aparecem nos filtros operacionais
const INICIO_AUTOMACAO = new Date("2026-05-16T03:00:00.000Z"); // 16/05/2026 00:00:00 BRT

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const filtro     = req.nextUrl.searchParams.get("filtro") ?? "todos";
  const page       = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const dataParam  = req.nextUrl.searchParams.get("data");   // YYYY-MM-DD  (dia exato)
  const desdeParam = req.nextUrl.searchParams.get("desde"); // ISO datetime (a partir de)
  const ateParam   = req.nextUrl.searchParams.get("ate");   // ISO datetime (até)
  const planoParam = req.nextUrl.searchParams.get("plano"); // nome do plano

  const where: Record<string, unknown> = {};

  switch (filtro) {
    case "pagos":
      where.status = "pago";
      where.data_pedido = { gte: INICIO_AUTOMACAO };
      break;
    case "pendentes":
      where.status = "pago";
      where.entrega_whatsapp = false;
      where.entrega_email = false;
      where.data_pedido = { gte: INICIO_AUTOMACAO };
      break;
    case "erro":
      where.status = "pago";
      where.gerou_musica = false;
      where.data_pedido = { gte: INICIO_AUTOMACAO };
      break;
  }

  if (dataParam) {
    // Interpreta o dia selecionado como BRT (meia-noite até 23:59 no fuso de Brasília)
    where.data_pedido = {
      gte: new Date(`${dataParam}T00:00:00-03:00`),
      lte: new Date(`${dataParam}T23:59:59.999-03:00`),
    };
  } else if (desdeParam || ateParam) {
    const range: Record<string, Date> = {};
    if (desdeParam) range.gte = new Date(desdeParam);
    if (ateParam)   range.lte = new Date(ateParam);
    where.data_pedido = range;
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
