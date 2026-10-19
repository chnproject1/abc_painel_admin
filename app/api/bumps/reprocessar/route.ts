import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispararVideoBr, ESPERA_FOTOS_BR_MIN } from "@/lib/br-bumps";

/**
 * Vídeo com letra do order bump do BR que ficou parado:
 *   · sem fotos depois de ESPERA_FOTOS_BR_MIN (2 h) e música pronta → sai sem fotos
 *   · com fotos e música pronta há mais de 30 min sem ter saído (disparo perdido)
 *
 *   POST /api/bumps/reprocessar              header x-callback-secret (N8N_CALLBACK_SECRET)
 *   POST /api/bumps/reprocessar?simular=1    só lista, sem disparar
 *
 * Chamar a cada 10 min (Power Automate: Recurrence → este HTTP), como o
 * /api/es/reprocessar. Pedido sem bump nunca entra aqui.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (secret && (req.headers.get("x-callback-secret") ?? req.nextUrl.searchParams.get("secret")) !== secret) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }
  const simular = req.nextUrl.searchParams.has("simular");
  const minAtras = (m: number) => new Date(Date.now() - m * 60000);

  const parados = await prisma.pedidoVideo.findMany({
    where: {
      opcoes: { path: ["modelo"], equals: "letra" },
      pedido: { status: "pago", link_audio: { not: null } },
      OR: [
        { producao: "aguardando_fotos", criado_em: { lt: minAtras(ESPERA_FOTOS_BR_MIN) } },
        { producao: "fotos_enviadas", fotos_em: { lt: minAtras(30) } },
      ],
    },
    select: { pedido_id: true, producao: true },
    take: 20,
  });

  const resultado: Record<string, string> = {};
  for (const v of parados) resultado[v.pedido_id] = simular ? `simulado (${v.producao})` : await dispararVideoBr(v.pedido_id);
  return NextResponse.json({ success: true, total: parados.length, resultado });
}
