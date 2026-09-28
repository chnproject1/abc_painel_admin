import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WHERE_VIDEO_LIBERADO, WHERE_SEM_RASTREIO } from "@/lib/es-ofertas";
import { FILTROS_ES } from "@/lib/es-resumo";
import { VIDEO_TRAVADO_MIN } from "@/lib/video-estado";

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

  /* Chaves da visão geral nova (lib/es-resumo.ts): a MESMA regra que conta o
     número monta a lista, pra o quadro e a lista nunca discordarem. */
  const regra = filtro ? FILTROS_ES[filtro] : undefined;
  if (regra) where.AND = [regra()];

  switch (regra ? "" : filtro) {
    case "pagos":
      where.status = "pago";
      break;
    // Falta alguma entrega — principal ou extras
    case "pendentes":
      where.status = "pago";
      where.OR = [
        { entrega_email: false },
        { AND: [{ OR: [{ up1_status: "pago" }, { ds_status: "pago", NOT: { up1_status: "pago" } }] }, { pagina_entrega_email: false }] },
        { AND: [{ OR: [{ up2_status: "pago" }, { ds_status: "pago" }] }, { up_entrega_email: false }, { video: null }] },
        { video: { is: { producao: "concluido", entrega_email: false } } },
      ];
      break;
    // Alguma geração falhou — principal ou extras
    case "erro":
      where.status = "pago";
      where.OR = [
        { gerou_musica: false, entrega_email: false },
        { AND: [{ OR: [{ up2_status: "pago" }, { ds_status: "pago" }] }, { up_gerou_musica: false, up_entrega_email: false }, { video: null }] },
        { video: { is: { producao: "erro" } } },
      ];
      break;
    // Vídeo (upsell 2 / downsell com vídeo)
    case "video":
      where.status = "pago";
      Object.assign(where, WHERE_VIDEO_LIBERADO);
      where.video = { isNot: null };   // pedidos antigos (músicas extras) ficam de fora
      break;
    case "video_sem_fotos":
      where.status = "pago";
      Object.assign(where, WHERE_VIDEO_LIBERADO);
      where.video = { is: { producao: "aguardando_fotos" } };
      break;
    case "video_pendentes":
      where.status = "pago";
      where.video = { is: { producao: "concluido", entrega_email: false } };
      break;
    case "video_erro": {
      const travado = new Date(Date.now() - VIDEO_TRAVADO_MIN * 60000);
      where.status = "pago";
      where.video = { is: { OR: [
        { producao: "erro" },
        { producao: "renderizando", atualizado_em: { lt: travado } },
        { producao: "fotos_enviadas", atualizado_em: { lt: travado } },
      ] } };
      break;
    }
    // Rastreio: venda paga ainda não registrada na UTMify/Meta/TikTok
    case "rastreio":   // alguma oferta paga (frente, up1, up2 ou ds) ainda sem rastreio
      Object.assign(where, WHERE_SEM_RASTREIO);
      break;
    case "video_rastreio":
      where.status = "pago";
      where.video = { is: { rastreado: false } };
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
    // Dia interpretado no fuso de Nova York (operação ES (LATAM))
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
    prisma.pedidoEs.findMany({
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
        // Resumo do vídeo pro selo "🎬 Vídeo: …" do card (igual ao BR)
        video: { select: { producao: true, entrega_email: true, erro_msg: true, atualizado_em: true } },
      },
      orderBy: { data_pedido: "asc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.pedidoEs.count({ where }),
  ]);

  return NextResponse.json({ pedidos, total, page, pages: Math.ceil(total / LIMIT) });
}
