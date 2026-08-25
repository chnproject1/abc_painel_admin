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
  const dataParam  = req.nextUrl.searchParams.get("data");  // YYYY-MM-DD (dia exato)
  const desdeParam = req.nextUrl.searchParams.get("desde"); // ISO datetime
  const ateParam   = req.nextUrl.searchParams.get("ate");   // ISO datetime
  const planoParam = req.nextUrl.searchParams.get("plano");

  const where: Record<string, unknown> = {};

  switch (filtro) {
    case "pagos":
      where.status = "pago";
      break;
    // Entrega principal pendente
    case "pendentes":
      where.status = "pago";
      where.entrega_email = false;
      break;
    // Entrega principal: música não gerada
    case "erro":
      where.status = "pago";
      where.gerou_musica = false;
      where.entrega_email = false;
      break;
    // Upsell 2 comprado e ainda não entregue
    case "pendentes_up":
      where.OR = [{ up2_status: "pago" }, { ds_status: "pago" }];
      where.up_entrega_email = false;
      break;
    // Upsell 2 comprado e músicas extras não geradas
    case "erro_up":
      where.OR = [{ up2_status: "pago" }, { ds_status: "pago" }];
      where.up_gerou_musica = false;
      where.up_entrega_email = false;
      break;
    // Ofertas do funil aceitas
    case "up1":
      where.up1_status = "pago";
      break;
    case "up2":
      where.up2_status = "pago";
      break;
    case "ds":
      where.ds_status = "pago";
      break;
  }

  if (dataParam) {
    // Dia interpretado no fuso de Nova York (operação US)
    where.data_pedido = {
      gte: new Date(`${dataParam}T00:00:00-04:00`),
      lte: new Date(`${dataParam}T23:59:59.999-04:00`),
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
    prisma.pedidoUs.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        plano: true,
        status: true,
        up1_status: true,
        up2_status: true,
        ds_status: true,
        estilo: true,
        gerou_musica: true,
        up_gerou_musica: true,
        link_audio: true,
        link_pagina: true,
        data_entrega: true,
        data_pedido: true,
        entrega_email: true,
        up_entrega_email: true,
      },
      orderBy: { data_pedido: "asc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.pedidoUs.count({ where }),
  ]);

  return NextResponse.json({ pedidos, total, page, pages: Math.ceil(total / LIMIT) });
}
