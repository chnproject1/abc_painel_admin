import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIDEO_TRAVADO_MIN } from "@/lib/video-estado";

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

    // Pagaram e NÃO foram entregues
    prisma.pedido.count({
      where: {
        ...filtroBase,
        status: "pago",
        entrega_whatsapp: false,
        entrega_email: false,
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

  // ── Upsell de vídeo ───────────────────────────────────────────────────
  // "Erro de geração" inclui o render que falhou E o que travou: renderizando
  // sem atualização, ou pago sem o render começar, há mais de VIDEO_TRAVADO_MIN.
  const travado = new Date(Date.now() - VIDEO_TRAVADO_MIN * 60000);
  const [video_total, video_pagos, video_pendentes_envio, video_erro_geracao] = await Promise.all([
    prisma.pedidoVideo.count(),
    prisma.pedidoVideo.count({ where: { status: "pago" } }),
    prisma.pedidoVideo.count({ where: { status: "pago", entrega_whatsapp: false } }),
    prisma.pedidoVideo.count({
      where: {
        status: "pago",
        OR: [
          { producao: "erro" },
          { producao: "renderizando", atualizado_em: { lt: travado } },
          { producao: { in: ["fotos_enviadas", "aguardando_fotos"] }, pago_em: { lt: travado } },
        ],
      },
    }),
  ]);

  return NextResponse.json({
    total, pagos, pendentes_envio, erro_geracao, pendentes_rastreio,
    video: { total: video_total, pagos: video_pagos, pendentes_envio: video_pendentes_envio, erro_geracao: video_erro_geracao },
  });
}
