import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { avisarVideoLiberadoEs, CONFIRMACAO_MAX_TENTATIVAS } from "@/lib/video-es-producao";
import { FILTROS_ES } from "@/lib/es-resumo";

/**
 * Reenvio automático da confirmação do vídeo ES (e-mail "Sube tus fotos").
 *
 *   POST /api/es/video/confirmacoes      header x-callback-secret
 *
 * Chamado a cada 5 min pelo fluxo n8n "abcMusic - ES - Reenvio Confirmação
 * Vídeo" (Schedule Trigger → este HTTP). A regra fica toda aqui:
 *   - só quem está com a confirmação pendente (mesma regra do card do painel:
 *     não enviada, sem fotos e sem ter aberto o link);
 *   - comprado há mais de CONFIRMACAO_ESPERA_MIN (o envio da compra pode
 *     ainda estar rodando);
 *   - no máximo CONFIRMACAO_MAX_TENTATIVAS envios — e-mail digitado errado
 *     falha sempre, então para e fica na pendência pra resolver na mão.
 * Quem já mandou as fotos nunca recebe (avisarVideoLiberadoEs confere).
 */

const CONFIRMACAO_ESPERA_MIN = 3;
const LOTE = 50;

function autorizado(req: NextRequest): boolean {
  const secret = process.env.ES_N8N_SECRET || process.env.ES_CHECKOUT_SECRET || process.env.US_N8N_SECRET || process.env.US_CHECKOUT_SECRET;
  if (!secret) return true; // sem segredo configurado, rota aberta (igual ao /api/es/n8n)
  const token =
    req.headers.get("x-callback-secret") ??
    req.headers.get("x-checkout-secret") ??
    req.nextUrl.searchParams.get("secret");
  return token === secret;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const limite = new Date(Date.now() - CONFIRMACAO_ESPERA_MIN * 60000);
  const pendentes = await prisma.pedidoEs.findMany({
    where: {
      AND: [FILTROS_ES.video_sem_confirmacao()],
      video: { is: { criado_em: { lt: limite }, envio_confirmacao_tentativas: { lt: CONFIRMACAO_MAX_TENTATIVAS } } },
    } as any,
    select: { id: true, video: { select: { token: true, envio_confirmacao_tentativas: true } } },
    orderBy: { data_pedido: "asc" },
    take: LOTE,
  });

  const resultado: { id: string; tentativa: number; resultado: string }[] = [];
  for (const p of pendentes) {
    if (!p.video) continue;
    const r = await avisarVideoLiberadoEs(p.id, p.video.token);
    resultado.push({ id: p.id, tentativa: p.video.envio_confirmacao_tentativas + 1, resultado: r });
  }

  return NextResponse.json({
    success: true,
    reenviados: resultado.filter(r => r.resultado === "avisado").length,
    pulados: resultado.filter(r => r.resultado !== "avisado").length,
    detalhes: resultado,
  });
}
