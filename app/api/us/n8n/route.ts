import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Callbacks das automações da operação US (model PedidoUs).
 *
 * Mesmos nomes de ação do /api/n8n do BR, para os nós do n8n serem portados
 * trocando só a URL. As ações com prefixo `up_` são do segundo fluxo, que gera
 * as duas músicas extras do upsell 2.
 *
 * Proteção: aceita US_N8N_SECRET e, se ela não existir, US_CHECKOUT_SECRET —
 * assim funciona sem criar uma variável nova. O header pode ser
 * `x-callback-secret` (igual ao BR) ou `x-checkout-secret`.
 *
 * Nenhuma ação mexe em `status` nem nos status das ofertas: isso é do checkout.
 * Todas as escritas são absolutas, então reenviar a mesma ação é inofensivo.
 */

const ACOES = [
  // Fluxo 1 — venda inicial, música 1
  "music_ready", "email_entregue", "email_erro", "erro_geracao",
  // Fluxo 2 — upsell 2, músicas 2 e 3
  "up_music_ready", "up_email_entregue", "up_email_erro", "up_erro_geracao",
];

function autorizado(req: NextRequest): boolean {
  const secret = process.env.US_N8N_SECRET || process.env.US_CHECKOUT_SECRET;
  if (!secret) return true; // sem segredo configurado, rota aberta
  const token =
    req.headers.get("x-callback-secret") ??
    req.headers.get("x-checkout-secret") ??
    req.nextUrl.searchParams.get("secret");
  return token === secret;
}

/** Converte a data recebida do n8n, ignorando valor ausente ou inválido */
function parseData(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Campo de texto: grava só se veio preenchido, para não apagar o que já existe */
function txt(v: any): string | undefined {
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const { action, id } = data;
  if (!id)     return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });
  if (!action) return NextResponse.json({ success: false, error: "action obrigatório" }, { status: 400 });

  if (!ACOES.includes(action)) {
    return NextResponse.json(
      { success: false, error: `action desconhecida: ${action}. Válidas: ${ACOES.join(", ")}` },
      { status: 400 },
    );
  }

  let update: any;
  let mensagem: string;

  switch (action) {
    /* ── Fluxo 1: venda inicial (música 1) ── */

    case "music_ready":
      update = {
        gerou_musica: true,
        erro_geracao: false,
        song_id:      txt(data.song_id),
        link_pagina:  txt(data.link_pagina),
        link_basica:  txt(data.link_basica),
        link_audio:   txt(data.link_audio),
        link_mp4:     txt(data.link_mp4),
        data_entrega: parseData(data.data_entrega),
      };
      mensagem = "Música 1 marcada como gerada";
      break;

    case "email_entregue":
      update = { entrega_email: true, data_entrega: parseData(data.data_entrega) };
      mensagem = "Entrega principal marcada como entregue";
      break;

    case "email_erro":
      update = { entrega_email: false };
      mensagem = "Entrega principal marcada como erro";
      break;

    case "erro_geracao":
      update = { gerou_musica: false, erro_geracao: true };
      mensagem = "Erro de geração da música 1 registrado";
      break;

    /* ── Fluxo 2: upsell 2 (músicas 2 e 3) ── */

    case "up_music_ready":
      // Aceita as duas músicas numa chamada só, ou uma por vez —
      // os campos ausentes não sobrescrevem o que já estiver gravado.
      update = {
        up_gerou_musica: true,
        up_erro_geracao: false,
        song_id2:     txt(data.song_id2),
        link_pagina2: txt(data.link_pagina2),
        link_basica2: txt(data.link_basica2),
        link_audio2:  txt(data.link_audio2),
        song_id3:     txt(data.song_id3),
        link_pagina3: txt(data.link_pagina3),
        link_basica3: txt(data.link_basica3),
        link_audio3:  txt(data.link_audio3),
        up_data_entrega: parseData(data.up_data_entrega ?? data.data_entrega),
      };
      mensagem = "Músicas extras marcadas como geradas";
      break;

    case "up_email_entregue":
      update = {
        up_entrega_email: true,
        up_data_entrega: parseData(data.up_data_entrega ?? data.data_entrega),
      };
      mensagem = "Entrega das músicas extras marcada como entregue";
      break;

    case "up_email_erro":
      update = { up_entrega_email: false };
      mensagem = "Entrega das músicas extras marcada como erro";
      break;

    case "up_erro_geracao":
      update = { up_gerou_musica: false, up_erro_geracao: true };
      mensagem = "Erro de geração das músicas extras registrado";
      break;

    default:
      return NextResponse.json({ success: false, error: "action não tratada" }, { status: 400 });
  }

  try {
    const pedido = await prisma.pedidoUs.update({
      where: { id },
      data: update,
      select: {
        id: true, plano: true, status: true,
        up1_status: true, up2_status: true, ds_status: true,
        gerou_musica: true, erro_geracao: true, entrega_email: true,
        up_gerou_musica: true, up_erro_geracao: true, up_entrega_email: true,
      },
    });

    // Repetido aqui para o fluxo poder ramificar sem consultar o checkout de novo
    const entrega_pagina = pedido.up1_status === "pago" || pedido.ds_status === "pago";

    return NextResponse.json({ success: true, message: mensagem, pedido, entrega_pagina });
  } catch (e: any) {
    if (e?.code === "P2025") {
      // Sintoma clássico de ter apontado o nó para a operação errada
      return NextResponse.json(
        { success: false, error: `Pedido ${id} não encontrado em PedidoUs (operação US)` },
        { status: 404 },
      );
    }
    console.error("[us/n8n callback]", e);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
