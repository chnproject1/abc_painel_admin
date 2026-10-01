import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Recuperação de pedidos ES (LATAM) — um e-mail só, já com o desconto.
 *
 *   POST /api/es/recuperacao              header x-callback-secret
 *   POST /api/es/recuperacao?simular=1    só lista quem receberia, sem enviar
 *   POST /api/es/recuperacao?id=<pedido>  teste: envia só pra esse pedido (pendente)
 *
 * Chamado a cada 10 min pelo Power Automate ("abcMusic - ES - Recuperação":
 * Recurrence → este HTTP). Quem recebe:
 *   - pedido `pendente`, que não é ele mesmo uma recuperação (recovery_id vazio);
 *   - criado há mais de ESPERA_MIN e há menos de JANELA_DIAS;
 *   - que nunca recebeu (`recuperacao` = 0);
 *   - com e-mail válido, e sem outro pedido PAGO do mesmo e-mail depois dele
 *     (quem refez o quiz e pagou não recebe desconto do pedido abandonado).
 *
 * Para cada um: marca `recuperacao` = 1 ANTES de chamar o n8n (nunca manda dois)
 * e chama o fluxo "ES - Recuperação" (ES_N8N_RECUPERACAO_WEBHOOK_URL), que monta
 * e envia o e-mail. O link leva ao funil de recuperação do site (?p=<id>):
 * "¿Qué te detuvo?" → resolve o motivo (letra, estilo, dúvida...) → oferta
 * única (Silver, entrega hoje, US$9) → upsells.
 * Se o n8n não responder, volta pra 0 e tenta de novo na próxima rodada.
 */

const ESPERA_MIN = 30;
const JANELA_DIAS = 7;
const LOTE = 10;            // por rodada — cada um vira uma execução do n8n que fica viva ~40s
                            // (Wait + consulta ao Resend); o plano tem limite de execuções simultâneas
const INTERVALO_MS = 3000;  // entre um disparo e outro: no máximo ~10 execuções da recuperação ao mesmo tempo

/* Oferta da recuperação — a mesma de create-checkout-session.mjs (site ES):
   o Silver (entrega hoje) pelo preço do Basic, pra todo mundo. Aqui é só o
   que vai escrito no e-mail; quem cobra é o site. */
const OFERTA = { preco: "US$9", preco_de: "US$12", entrega: "hoy" };

const SITE = (process.env.ES_SITE_URL || "https://abcmusic-quiz-es.netlify.app").replace(/\/+$/, "");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const limpaEmail = (e?: string | null) => String(e || "").split("?")[0].trim().toLowerCase();
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  const simular = req.nextUrl.searchParams.get("simular") === "1";

  const webhook = process.env.ES_N8N_RECUPERACAO_WEBHOOK_URL;
  if (!webhook && !simular) {
    return NextResponse.json({ error: "Webhook não configurado (falta a variável ES_N8N_RECUPERACAO_WEBHOOK_URL)" }, { status: 500 });
  }

  const agora = Date.now();
  /* ?id=<pedido>: teste com UM pedido só — ignora a espera, a janela e o
     "já recebeu" (dá pra repetir). Continua exigindo pedido pendente. */
  const soId = req.nextUrl.searchParams.get("id");
  const candidatos = await prisma.pedidoEs.findMany({
    where: soId ? { id: soId, status: "pendente", recovery_id: null } : {
      status: "pendente",
      recovery_id: null,
      recuperacao: 0,
      data_pedido: { lt: new Date(agora - ESPERA_MIN * 60000), gte: new Date(agora - JANELA_DIAS * 86400000) },
    },
    select: { id: true, nome: true, email: true, plano: true, data_pedido: true },
    orderBy: { data_pedido: "asc" },
  });

  // Quem pagou depois com o mesmo e-mail (refez o quiz) fica de fora
  const pagos = await prisma.pedidoEs.findMany({
    where: { status: "pago", data_pedido: { gte: new Date(agora - (JANELA_DIAS + 1) * 86400000) } },
    select: { email: true, data_pedido: true },
  });
  const pagouDepois = (email: string, quando: Date | null) =>
    pagos.some(p => limpaEmail(p.email) === email && p.data_pedido && quando && p.data_pedido >= quando);

  const pulados: { id: string; motivo: string }[] = [];
  const fila = candidatos.filter(c => {
    const email = limpaEmail(c.email);
    if (!EMAIL_RE.test(email) || email.includes("..")) { pulados.push({ id: c.id, motivo: "e-mail inválido" }); return false; }
    if (pagouDepois(email, c.data_pedido)) { pulados.push({ id: c.id, motivo: "pagou depois com o mesmo e-mail" }); return false; }
    return true;
  });

  const enviados: { id: string; email: string; resultado: string }[] = [];
  for (const c of fila.slice(0, LOTE)) {
    const email = limpaEmail(c.email);
    const corpo = {
      pedido_id: c.id,
      email,
      nome: String(c.nome || "").trim().split(" ")[0],   // homenageado
      ...OFERTA,
      link: `${SITE}/?p=${encodeURIComponent(c.id)}`,
    };
    if (simular) { enviados.push({ id: c.id, email, resultado: "simulado" }); continue; }

    // Marca antes: se a rodada seguinte começar no meio desta, não manda de novo
    await prisma.pedidoEs.update({ where: { id: c.id }, data: { recuperacao: 1, recuperacao_em: new Date() } });
    let resultado: string;
    try {
      const r = await fetch(webhook!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(8000),
      });
      resultado = r.ok ? "enviado" : `n8n_${r.status}`;
    } catch (e: any) {
      resultado = "erro: " + (e?.message ?? "rede");
    }
    if (resultado !== "enviado") {
      // n8n fora: devolve pra fila, a próxima rodada tenta de novo
      await prisma.pedidoEs.update({ where: { id: c.id }, data: { recuperacao: 0, recuperacao_em: null } });
    }
    enviados.push({ id: c.id, email, resultado });
    await pausa(INTERVALO_MS);
  }

  return NextResponse.json({
    success: true,
    simulado: simular,
    na_fila: fila.length,
    enviados: enviados.filter(e => e.resultado === "enviado" || e.resultado === "simulado").length,
    restam: Math.max(0, fila.length - LOTE),
    detalhes: enviados,
    pulados,
  });
}
