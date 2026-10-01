import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarToken, linkFotosEs, linkVerVideoEs, urlPublica } from "@/lib/video";
import { liberacoes, dsFoiOfertado, montarPlanoEs, dsTipoDe } from "@/lib/es-ofertas";
import { avisarVideoLiberadoEs, dispararPaginaEs } from "@/lib/video-es-producao";
import { marcarRastreio } from "@/lib/es-rastreio";

/**
 * Entrada de pedidos da operação ES (LATAM) (model PedidoEs).
 *
 * O checkout chama esta rota uma vez por etapa do funil, sempre com o mesmo
 * `id` do Stripe. Todas as escritas são absolutas (nunca incrementam), então
 * reenviar a mesma ação reescreve os mesmos valores em vez de duplicar.
 *
 * Funil: venda inicial -> up1 (página Premium) -> up2 (vídeo com fotos)
 *        -> ds1 (comprou só o vídeo: oferece a página), ds2 (comprou só a
 *           página: oferece o vídeo) ou ds3 (recusou os dois: os dois juntos).
 *           Os três gravam em ds_status; qual foi se deduz pelo que já estava
 *           pago. Regras em lib/es-ofertas.ts.
 *
 * Vídeo (up2 ou ds que inclui o vídeo): a produção fica em PedidoVideoEs. A
 * linha é criada aqui, na hora em que a venda libera o vídeo, e a resposta
 * devolve `video_token` / `video_link` pro funil mandar o cliente pra página
 * de fotos (e pro n8n pôr o mesmo link no e-mail).
 *
 * Proteção: se ES_CHECKOUT_SECRET (ou a antiga US_CHECKOUT_SECRET) estiver definida no ambiente, exige o header
 * `x-checkout-secret`. Sem a variável a rota fica aberta — mesmo padrão do
 * /api/n8n, para permitir configurar depois sem quebrar quem já chama.
 */

const TIERS = ["basic", "silver"];

const ACOES = [
  "update",
  "pago",
  "up1_pago", "up1_recusado",
  "up2_pago", "up2_recusado",
  "ds_pago",  "ds_recusado",
  "finalizar",
];

/**
 * Nomes que o funil (Netlify) manda -> colunas do model PedidoEs.
 * Ver CONTRATO-PAINEL.md do repositório do funil.
 * `phone`, `cpf` e `currency` chegam mas são ignorados: a operação ES não coleta
 * telefone nem documento, e a moeda é sempre USD nesta tabela.
 */
const MAPA_FUNIL: Record<string, string> = {
  name: "nome",       nome: "nome",
  email: "email",     mail: "email",
  plan: "plano",      plano: "plano",
  status: "status",
  estilo: "estilo",   letra: "letra",   idioma: "idioma",
  nomefiscal: "nomefiscal",
  comprador: "comprador",
  zip: "zip_code",    zip_code: "zip_code",
  pais: "pais",
  utm_source: "utm_source",     utm_campaign: "utm_campaign",
  utm_medium: "utm_medium",     utm_content: "utm_content",
  utm_term: "utm_term",         utm_id: "utm_id",
  fbclid: "fbclid",   ttclid: "ttclid",   pixel_id: "pixel_id",
  fbp: "fbp",         ttp: "ttp",         user_agent: "user_agent",
  ip: "ip",           funil: "funil",     recovery_id: "recovery_id",
  recuperacao_motivo: "recuperacao_motivo",
  upsell: "upsell",
  upsell_status: "upsell_status",
  upsell_amount: "upsell_amount",
  upsell_payment_id: "upsell_payment_id",
  upsell_erro: "upsell_erro",
  upsell_n8n: "upsell_n8n",
};

const lista = (v: unknown): string[] =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Traduz o registro bruto do funil para os status e valores por oferta que o
 * portal usa. Nomes que o funil manda: pagina = up1, video = up2 (o antigo
 * `versoes` das músicas extras ainda é aceito), ds / ds1 / ds2 / ds3 = downsell
 * (o antigo `combo` também). Qual downsell foi se deduz pelo que já estava pago.
 *
 * No funil ES, `upsell` lista os PRODUTOS pagos ('video,ds1'), alinhados com
 * `upsell_amount`. Nos pedidos antigos do US ela listava entregáveis, e só o
 * sufixo `_ds` do plano identificava o combo.
 */
function derivarOfertas(linha: {
  plano?: string | null;
  upsell?: string | null;
  upsell_status?: string | null;
  upsell_amount?: string | null;
  upsell_erro?: string | null;
}) {
  const out: Record<string, unknown> = {};
  const plano = linha.plano ?? "";

  if (linha.upsell_status === "recusado") {
    // O produto recusado vem no início do upsell_erro, no formato "produto:codigo"
    const produto = String(linha.upsell_erro ?? "").split(":")[0].replace("-teste", "");
    if (produto === "pagina")  out.up1_status = "recusado";
    if (produto === "versoes" || produto === "video") out.up2_status = "recusado";
    if (produto === "combo"   || /^ds[123]?$/.test(produto)) out.ds_status  = "recusado";
    return out;
  }

  if (linha.upsell_status !== "pago") return out;

  const entregues = lista(linha.upsell);
  const valores   = lista(linha.upsell_amount);
  const soma = (arr: string[]) => arr.reduce((t, v) => t + (parseFloat(v) || 0), 0);

  const ehDs = (e: string) => /^ds[123]?$/.test(e) || e === "combo";

  // Pedido antigo do funil US: o combo gravava os entregáveis ('pagina,versoes')
  // e só o `_ds` do plano dizia que foi downsell — uma cobrança só, valor somado.
  if (/_ds$/.test(plano) && !entregues.some(ehDs)) {
    out.ds_status = "pago";
    const total = soma(valores);
    if (total > 0) out.ds_valor = total;
    return out;
  }

  // Funil ES: um produto por cobrança ('video,ds1'), na mesma posição do
  // valor ('23.00,9.00'). O downsell pode vir depois de um upsell pago, então
  // cada valor fica com a oferta dele — nunca somar.
  entregues.forEach((produto, i) => {
    const v = parseFloat(valores[i] ?? "");
    if (produto === "pagina") {
      out.up1_status = "pago";
      if (Number.isFinite(v)) out.up1_valor = v;
    }
    if (produto === "versoes" || produto === "video") {
      out.up2_status = "pago";
      if (Number.isFinite(v)) out.up2_valor = v;
    }
    if (ehDs(produto)) {
      out.ds_status = "pago";
      if (Number.isFinite(v)) out.ds_valor = v;
    }
  });

  return out;
}

function ok(data: object) {
  return NextResponse.json({ success: true, ...data });
}

function erro(msg: string, status = 500) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

function autorizado(req: NextRequest): boolean {
  const secret = process.env.ES_CHECKOUT_SECRET || process.env.US_CHECKOUT_SECRET;   // US_ aceito até a troca no Easypanel
  if (!secret) return true; // sem segredo configurado, rota aberta
  const token =
    req.headers.get("x-checkout-secret") ?? req.nextUrl.searchParams.get("secret");
  return token === secret;
}

// Aviso devolvido no corpo enquanto a rota estiver sem segredo configurado
function avisoSeguranca() {
  return (process.env.ES_CHECKOUT_SECRET || process.env.US_CHECKOUT_SECRET)
    ? undefined
    : "ES_CHECKOUT_SECRET não configurada — rota aberta a qualquer chamador";
}

/** Extrai o tier (basic|silver) de um plano já montado, ex: "basic_up1_up2" */
function tierDe(plano: string | null | undefined): string {
  return plano?.startsWith("silver") ? "silver" : "basic";
}

/* O plano é derivado em lib/es-ofertas.ts (montarPlanoEs): o `_ds` se soma
   aos sufixos de upsell, porque agora o downsell pode vir junto com um deles. */

/** Garante a linha de produção do vídeo quando a venda libera o vídeo. Idempotente. */
async function garantirVideo(id: string, ofertas: { up1_status?: string | null; up2_status?: string | null; ds_status?: string | null }) {
  if (!liberacoes(ofertas).video) return null;
  let v = await prisma.pedidoVideoEs.findUnique({ where: { pedido_id: id }, select: { token: true, producao: true, video_path: true } });
  if (!v) {
    v = await prisma.pedidoVideoEs.create({ data: { pedido_id: id, token: gerarToken() }, select: { token: true, producao: true, video_path: true } });
    // Vídeo acabou de ser liberado: e-mail com o link das fotos, na hora
    await avisarVideoLiberadoEs(id, v.token);
  }
  return { video_token: v.token, video_link: linkFotosEs(v.token), video_producao: v.producao, video_ver_link: linkVerVideoEs(v.token), video_url: urlPublica(v.video_path) };
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

  const p = await prisma.pedidoEs.findUnique({ where: { id }, include: { video: true } });
  if (!p) return NextResponse.json({ data: {} });

  // O n8n usa isto para decidir o que entregar
  const lib = liberacoes(p);
  const entrega_pagina = lib.pagina;
  const entrega_video  = lib.video;

  // O funil fechou quando todas as ofertas que chegaram a ser exibidas
  // têm resposta. O ds é exibido se alguma das duas foi recusada.
  const funil_completo =
    p.up1_status !== null &&
    p.up2_status !== null &&
    (!dsFoiOfertado(p) || p.ds_status !== null);

  return NextResponse.json({
    data: {
      id: p.id,
      status:     p.status,
      up1_status: p.up1_status,
      up2_status: p.up2_status,
      ds_status:  p.ds_status,
      // Devolvido com os MESMOS nomes usados na escrita, e também com os
      // nomes das colunas — o funil lê `plan`/`email`/`zip`, o n8n lê os dois.
      plano:      p.plano,
      plan:       p.plano,
      nome:       p.nome,
      name:       p.nome,
      email:      p.email,
      mail:       p.email,
      valor:      p.valor,
      amount:     p.valor,
      zip_code:   p.zip_code,
      zip:        p.zip_code,
      nomefiscal: p.nomefiscal,
      comprador:  p.comprador,
      pais:       p.pais,
      idioma:     p.idioma,
      estilo:     p.estilo,
      letra:      p.letra,

      // Registro bruto do funil
      upsell:            p.upsell,
      upsell_status:     p.upsell_status,
      upsell_amount:     p.upsell_amount,
      upsell_payment_id: p.upsell_payment_id,
      upsell_erro:       p.upsell_erro,
      upsell_n8n:        p.upsell_n8n,
      up1_valor:  p.up1_valor,
      up2_valor:  p.up2_valor,
      ds_valor:   p.ds_valor,

      // Sinais de controle para a automação
      entrega_pagina,
      entrega_video,
      ds_tipo: p.ds_status === "pago" ? dsTipoDe(p) : null,
      funil_completo,

      // Vídeo (upsell 2) — produção em PedidoVideoEs
      video_token:    p.video?.token ?? null,
      video_link:     p.video ? linkFotosEs(p.video.token) : null,      // página de fotos
      video_ver_link: p.video ? linkVerVideoEs(p.video.token) : null,   // página do vídeo pronto
      video_producao: p.video?.producao ?? null,
      video_url:      urlPublica(p.video?.video_path),
      video_entrega_email: p.video?.entrega_email ?? false,

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
      fbp:          p.fbp,
      ttp:          p.ttp,
      user_agent:   p.user_agent,

      // Rastreio por oferta (UTMify/Meta/TikTok) — o fluxo pode checar antes de reenviar
      rastreado:     p.rastreado,
      up1_rastreado: p.up1_rastreado,
      up2_rastreado: p.up2_rastreado,
      ds_rastreado:  p.ds_rastreado,
    },
  });
}

/* Pedido de recuperação pago (recovery_id = original): o original vira
   'recuperado', igual ao BR. Só mexe se ele ainda estiver pendente. */
async function marcarOriginalRecuperado(id: string) {
  const filho = await prisma.pedidoEs.findUnique({ where: { id }, select: { status: true, recovery_id: true } });
  if (filho?.status !== "pago" || !filho.recovery_id) return;
  await prisma.pedidoEs.updateMany({ where: { id: filho.recovery_id, status: "pendente" }, data: { status: "recuperado" } });
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
      idioma:       data.idioma      || "es",
      // O checkout novo pode ou não mandar o país; sem ele fica LATAM (venda pra toda a região)
      pais:         data.pais        || "LATAM",
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

    const pedido = await prisma.pedidoEs.upsert({
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

  /* ── action 'rastreado': venda da frente registrada na UTMify/Meta/TikTok ──
     Mesmo formato do /api/checkout do BR, pra o fluxo de rastreio (Power
     Automate) ser copiado trocando só a URL e o segredo. O /api/es/n8n
     aceita a mesma ação. Não passa pelo switch: não mexe em status nem plano. */
  if (data.action === "rastreado") {
    // `oferta` = front | up1 | up2 | ds1 | ds2 | ds3 (sem ela, a frente) — ver lib/es-rastreio.ts
    const r = await marcarRastreio(String(data.id), String(data.oferta || "front"), data.rastreado !== false);
    if (!r.success && /não encontrado/.test(String(r.error))) return ok({ message: "Pedido não encontrado, ignorado" });
    return NextResponse.json(r, { status: r.success ? 200 : 400 });
  }

  /* ── Com action: etapas do funil ── */
  if (!ACOES.includes(data.action)) {
    return erro(`action desconhecida: ${data.action}. Válidas: ${ACOES.join(", ")}`, 400);
  }

  const atual = await prisma.pedidoEs.findUnique({
    where: { id: data.id },
    select: {
      plano: true, status: true,
      up1_status: true, up2_status: true, ds_status: true,
      upsell: true, upsell_status: true, upsell_amount: true, upsell_erro: true,
    },
  });

  if (!atual) return erro("Pedido não encontrado", 404);

  /* ── update: merge genérico dos campos que o funil mandar ──
     Regra do contrato: mescla no registro só as colunas presentes no corpo e
     deixa as outras intactas. Nunca insere — se o id não existe, o 404 acima
     já respondeu. */
  if (data.action === "update") {
    const merge: any = {};
    const ignorados: string[] = [];

    for (const [chave, valor] of Object.entries(data)) {
      if (chave === "action" || chave === "id") continue;
      if (valor === undefined || valor === null || valor === "") continue;

      // amount vira Decimal na coluna valor
      if (chave === "amount") {
        const n = valorNumerico(valor);
        if (n !== undefined) merge.valor = n;
        continue;
      }
      // O funil manda estes por compatibilidade com o BR, mas a operação ES não usa
      if (chave === "phone" || chave === "cpf" || chave === "currency") continue;

      const coluna = MAPA_FUNIL[chave];
      if (coluna) merge[coluna] = String(valor);
      else ignorados.push(chave);
    }

    if (Object.keys(merge).length === 0) {
      return erro("Nenhum campo conhecido para atualizar", 400);
    }

    // Deriva os status e valores por oferta a partir do estado já mesclado
    Object.assign(merge, derivarOfertas({
      plano:         merge.plano         ?? atual.plano,
      upsell:        merge.upsell        ?? atual.upsell,
      upsell_status: merge.upsell_status ?? atual.upsell_status,
      upsell_amount: merge.upsell_amount ?? atual.upsell_amount,
      upsell_erro:   merge.upsell_erro   ?? atual.upsell_erro,
    }));

    const pedido = await prisma.pedidoEs.update({
      where: { id: data.id },
      data: merge,
      select: {
        id: true, plano: true, status: true,
        up1_status: true, up2_status: true, ds_status: true,
        valor: true, up1_valor: true, up2_valor: true, ds_valor: true,
      },
    });
    if (merge.status === "pago") await marcarOriginalRecuperado(pedido.id);
    const video = await garantirVideo(pedido.id, pedido);
    // Compra da página acabou de entrar: se a música já existe, envia agora
    if (!liberacoes(atual).pagina && liberacoes(pedido).pagina) await dispararPaginaEs(pedido.id);

    return ok({
      message: `${Object.keys(merge).length} campo(s) atualizado(s)`,
      pedido,
      entrega_pagina: liberacoes(pedido).pagina,
      entrega_video:  liberacoes(pedido).video,
      ...(video ?? {}),
      ...(ignorados.length ? { ignorados } : {}),
      aviso,
    });
  }

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
      // Pode vir com up1 ou up2 já pago: é o downsell da oferta que faltou
      if (atual.up1_status === "pago" && atual.up2_status === "pago") {
        alerta = "downsell registrado com up1 e up2 já pagos — não havia o que ofertar";
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
      // O ds é ofertado a quem recusou pelo menos uma das duas
      if (dsFoiOfertado({ up1_status, up2_status }) && ds_status === null) {
        ds_status = "recusado";
        update.ds_status = "recusado";
      }
      break;
    }
  }

  // O plano acompanha os status das ofertas
  update.plano = montarPlanoEs(tier, { up1_status, up2_status, ds_status });

  const pedido = await prisma.pedidoEs.update({
    where: { id: data.id },
    data: update,
    select: {
      id: true, plano: true, status: true,
      up1_status: true, up2_status: true, ds_status: true,
      valor: true, up1_valor: true, up2_valor: true, ds_valor: true,
    },
  });

  if (data.action === "pago") await marcarOriginalRecuperado(pedido.id);
  const lib = liberacoes(pedido);
  const video = await garantirVideo(pedido.id, pedido);
  // Compra da página acabou de entrar: se a música já existe, envia agora
  if (!liberacoes(atual).pagina && lib.pagina) await dispararPaginaEs(pedido.id);

  return ok({
    message: `Ação "${data.action}" aplicada`,
    pedido,
    entrega_pagina: lib.pagina,
    entrega_video:  lib.video,
    ds_tipo: lib.ds_tipo,
    // Quando a venda libera o vídeo: pra onde mandar o cliente subir as fotos
    ...(video ?? {}),
    ...(alerta ? { alerta } : {}),
    aviso,
  });
}
