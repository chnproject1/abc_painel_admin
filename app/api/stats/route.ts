import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filtroVideoErroBr } from "@/lib/video-estado";

// Somente pedidos a partir do início da automação são contabilizados nos stats
// Registros anteriores ficam no banco mas não afetam os indicadores
const INICIO_AUTOMACAO = new Date("2026-05-16T03:00:00.000Z"); // 16/05/2026 00:00:00 BRT

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const filtroBase = { data_pedido: { gte: INICIO_AUTOMACAO } };

  const [total, pagos, pendentes_envio, erro_geracao, pendentes_rastreio] = await Promise.all([
    // Total que iniciaram checkout
    prisma.pedido.count({ where: filtroBase }),

    // Pagaram
    prisma.pedido.count({ where: { ...filtroBase, status: "pago" } }),

    // Pagaram e NÃO foram entregues — ou algum item falhou na entrega
    // (bumps_enviados com "!", ex.: "estilo.whats!"), mesmo com a música entregue
    prisma.pedido.count({
      where: {
        ...filtroBase,
        status: "pago",
        OR: [{ entrega_whatsapp: false, entrega_email: false }, { bumps_enviados: { contains: "!" } }],
      },
    }),

    // Pagaram mas música não foi gerada e ainda não foram entregues
    prisma.pedido.count({
      where: {
        ...filtroBase,
        status: "pago",
        gerou_musica: false,
        entrega_whatsapp: false,
        entrega_email: false,
      },
    }),

    // Pagaram mas a conversão nunca foi registrada na UTMify
    prisma.pedido.count({
      where: { ...filtroBase, status: "pago", rastreado: false },
    }),
  ]);

  // ── Vídeo (upsell de fotos e vídeo com letra do order bump) ─────────────
  // "Erro de geração" inclui o render que falhou E o que travou — mesma regra
  // do estadoVideo (lib/video-estado.ts, filtroVideoErroBr).
  const [video_total, video_pagos, video_pendentes_envio, video_erro_geracao, video_sem_rastreio] = await Promise.all([
    prisma.pedidoVideo.count(),
    prisma.pedidoVideo.count({ where: { status: "pago" } }),
    prisma.pedidoVideo.count({ where: { status: "pago", entrega_whatsapp: false } }),
    prisma.pedidoVideo.count({ where: filtroVideoErroBr() }),
    // Pagou mas o fluxo track_upsell nunca marcou a venda como registrada
    prisma.pedidoVideo.count({ where: { status: "pago", rastreado: false } }),
  ]);

  return NextResponse.json({
    total, pagos, pendentes_envio, erro_geracao, pendentes_rastreio,
    video: { total: video_total, pagos: video_pagos, pendentes_envio: video_pendentes_envio, erro_geracao: video_erro_geracao, sem_rastreio: video_sem_rastreio },
  });
}
