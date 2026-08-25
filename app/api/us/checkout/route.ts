import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Entrada de pedidos da operação US (model PedidoUs).
 *
 * O checkout chama esta rota uma vez por etapa do funil, sempre com o mesmo
 * `id` do Stripe. Todas as escritas são absolutas (nunca incrementam), então
 * reenviar a mesma ação reescreve os mesmos valores em vez de duplicar.
 *
 * Funil: venda inicial -> up1 (página Premium) -> up2 (2 músicas extras)
 *        -> ds (página Premium, só ofertado se up1 e up2 forem recusados)
 *
 * Proteção: se US_CHECKOUT_SECRET estiver definida no ambiente, exige o header
 * `x-checkout-secret`. Sem a variável a rota fica aberta — mesmo padrão do
 * /api/n8n, para permitir configurar depois sem quebrar quem já chama.
 */

const TIERS = ["basic", "silver"];

const ACOES = [
  "pago",
  "up1_pago", "up1_recusado",
  "up2_pago", "up2_recusado",
  "ds_pago",  "ds_recusado",
  "finalizar",
];

function ok(data: object) {
  return NextResponse.json({ success: true, ...data });
}

function erro(msg: string, status = 500) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

function autorizado(req: NextRequest): boolean {
  const secret = process.env.US_CHECKOUT_SECRET;
  if (!secret) return true; // sem segredo configurado, rota aberta
  const token =
    req.headers.get("x-checkout-secret") ?? req.nextUrl.searchParams.get("secret");
  return token === secret;
}

// Aviso devolvido no corpo enquanto a rota estiver sem segredo configurado
function avisoSeguranca() {
  return process.env.US_CHECKOUT_SECRET
    ? undefined
    : "US_CHECKOUT_SECRET não configurada — rota aberta a qualquer chamador";
}

/** Extrai o tier (basic|silver) de um plano já montado, ex: "basic_up1_up2" */
function tierDe(plano: string | null | undefined): string {
  return plano?.startsWith("silver") ? "silver" : "basic";
}

/**
 * Deriva o plano a partir dos status das ofertas.
 * O downsell é exclusivo: quando pago, substitui os sufixos de upsell.
 */
function montarPlano(
  tier: string,
  up1: string | null,
  up2: string | null,
  ds: string | null,
): string {
  if (ds === "pago") return `${tier}_ds`;
  let plano = tier;
  if (up1 === "pago") plano += "_up1";
  if (up2 === "pago") plano += "_up2";
  return plano;
}

function valorNumerico(v: any): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/* ─────────────── GET — dados do pedido para as automações ─────────────── */

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return erro("Não autorizado", 401);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return erro("id obrigatório", 400);

  const p = await prisma.pedidoUs.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ data: {} });

  // O n8n usa isto para decidir se entrega o link da página Premium
  const entrega_pagina = p.up1_status === "pago" || p.ds_status === "pago";

  // O funil fechou quando todas as ofertas que chegaram a ser exibidas
  // têm resposta. O ds só é exibido se up1 e up2 forem recusados.
  const dsFoiOfertado = p.up1_status !== "pago" && p.up2_status !== "pago";
  const funil_completo =
    p.up1_status !== null &&
    p.up2_status !== null &&
    (!dsFoiOfertado || p.ds_status !== null);

  return NextResponse.json({
    data: {
      id: p.id,
      status:     p.status,
      up1_status: p.up1_status,
      up2_status: p.up2_status,
      ds_status:  p.ds_status,
      plano:      p.plano,
      plan:       p.plano,   // apelido compatível com o /api/checkout do BR
      name:       p.nome,
      mail:       p.email,
      nomefiscal: p.nomefiscal,
      zip_code:   p.zip_code,
      idioma:     p.idioma,
      estilo:     p.estilo,
      letra:      p.letra,

      // Sinais de controle para a automação
      entrega_pagina,
      funil_completo,

      // Produção — música 1
      gerou_musica: p.gerou_musica,
      song_id:      p.song_id,
      link_pagina:  p.link_pagina,
      link_basica:  p.link_basica,
      link_audio:   p.link_audio,
      link_mp4:     p.link_mp4,
      data_entrega: p.data_entrega,
      entrega_email: p.entrega_email,

      // Produção — músicas 2 e 3 (upsell 2)
      up_gerou_musica: p.up_gerou_musica,
      song_id2:     p.song_id2,
      link_pagina2: p.link_pagina2,
      link_basica2: p.link_basica2,
      link_audio2:  p.link_audio2,
      song_id3:     p.song_id3,
      link_pagina3: p.link_pagina3,
      link_basica3: p.link_basica3,
      link_audio3:  p.link_audio3,
      up_data_entrega:  p.up_data_entrega,
      up_entrega_email: p.up_entrega_email,

      // Rastreamento
      utm_source:   p.utm_source,
      utm_campaign: p.utm_campaign,
      utm_medium:   p.utm_medium,
      utm_content:  p.utm_content,
      utm_term:     p.utm_term,
      utm_id:       p.utm_id,
      fbclid:       p.fbclid,
      ttclid:       p.ttclid,
      pixel_id:     p.pixel_id,
      ip:           p.ip,
    },
  });
}

/* ─────────────── POST — criação e etapas do funil ─────────────── */

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return erro("Não autorizado", 401);

  let data: any;
  try {
    data = await req.json();
  } catch {
    return erro("JSON inválido", 400);
  }

  if (!data.id) return erro("id obrigatório", 400);
  const aviso = avisoSeguranca();

  /* ── Sem action: cria ou atualiza o pedido vindo do checkout ── */
  if (!data.action) {
    const tier = TIERS.includes(data.plan) ? data.plan : "basic";

    const base = {
      nome:         data.name        || "",
      email:        data.mail        || data.email || "",
      nomefiscal:   data.nomefiscal  || null,
      zip_code:     data.zip_code    || null,
      idioma:       data.idioma      || "en",
      estilo:       data.estilo      || null,
      letra:        data.letra       || null,
      utm_source:   data.utm_source  || null,
      utm_campaign: data.utm_campaign|| null,
      utm_medium:   data.utm_medium  || null,
      utm_content:  data.utm_content || null,
      utm_term:     data.utm_term    || null,
      utm_id:       data.utm_id      || null,
      fbclid:       data.fbclid      || null,
      ttclid:       data.ttclid      || null,
      pixel_id:     data.pixel_id    || null,
      ip:           data.ip          || null,
      funil:        data.funil       || null,
      recovery_id:  data.recovery_id || null,
    };

    const pedido = await prisma.pedidoUs.upsert({
      where: { id: data.id },
      create: {
        id:          data.id,
        plano:       tier,
        status:      data.status || "pendente",
        valor:       valorNumerico(data.amount) ?? null,
        data_pedido: new Date(),
        ...base,
      },
      // Na reentrada do checkout, não sobrescreve o que já foi decidido
      // no funil (status das ofertas, plano, valores).
      update: Object.fromEntries(
        Object.entries(base).filter(([, v]) => v !== null && v !== ""),
      ),
    });

    return ok({ message: "Pedido registrado", plano: pedido.plano, aviso });
  }

  /* ── Com action: etapas do funil ── */
  if (!ACOES.includes(data.action)) {
    return erro(`action desconhecida: ${data.action}. Válidas: ${ACOES.join(", ")}`, 400);
  }

  const atual = await prisma.pedidoUs.findUnique({
    where: { id: data.id },
    select: {
      plano: true, status: true,
      up1_status: true, up2_status: true, ds_status: true,
    },
  });

  if (!atual) return erro("Pedido não encontrado", 404);

  const tier = tierDe(atual.plano);
  let { up1_status, up2_status, ds_status } = atual;
  const update: any = {};
  let alerta: string | undefined;

  switch (data.action) {
    case "pago":
      update.status = "pago";
      update.valor = valorNumerico(data.amount) ?? undefined;
      break;

    case "up1_pago":
      up1_status = "pago";
      update.up1_status = "pago";
      update.up1_valor = valorNumerico(data.amount) ?? undefined;
      break;

    case "up1_recusado":
      up1_status = "recusado";
      update.up1_status = "recusado";
      break;

    case "up2_pago":
      up2_status = "pago";
      update.up2_status = "pago";
      update.up2_valor = valorNumerico(data.amount) ?? undefined;
      break;

    case "up2_recusado":
      up2_status = "recusado";
      update.up2_status = "recusado";
      break;

    case "ds_pago":
      if (atual.up1_status === "pago" || atual.up2_status === "pago") {
        alerta = "downsell registrado com up1 ou up2 já pago — o funil não deveria ter ofertado o ds";
      }
      ds_status = "pago";
      update.ds_status = "pago";
      update.ds_valor = valorNumerico(data.amount) ?? undefined;
      break;

    case "ds_recusado":
      ds_status = "recusado";
      update.ds_status = "recusado";
      break;

    // Cliente viu todas as ofertas: o que não foi comprado vira recusado,
    // deixando o funil fechado e a automação livre para começar.
    case "finalizar": {
      if (up1_status === null) { up1_status = "recusado"; update.up1_status = "recusado"; }
      if (up2_status === null) { up2_status = "recusado"; update.up2_status = "recusado"; }
      // O ds só é ofertado quando up1 e up2 são recusados
      const dsFoiOfertado = up1_status !== "pago" && up2_status !== "pago";
      if (dsFoiOfertado && ds_status === null) {
        ds_status = "recusado";
        update.ds_status = "recusado";
      }
      break;
    }
  }

  // O plano acompanha os status das ofertas
  update.plano = montarPlano(tier, up1_status, up2_status, ds_status);

  const pedido = await prisma.pedidoUs.update({
    where: { id: data.id },
    data: update,
    select: {
      id: true, plano: true, status: true,
      up1_status: true, up2_status: true, ds_status: true,
      valor: true, up1_valor: true, up2_valor: true, ds_valor: true,
    },
  });

  const entrega_pagina = pedido.up1_status === "pago" || pedido.ds_status === "pago";

  return ok({
    message: `Ação "${data.action}" aplicada`,
    pedido,
    entrega_pagina,
    ...(alerta ? { alerta } : {}),
    aviso,
  });
}
