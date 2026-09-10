import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function limparTelefone(tel: any): string {
  if (!tel) return "";
  return String(tel).replace(/\D/g, "");
}

function ok(data: object) {
  return NextResponse.json({ success: true, ...data });
}

function erro(msg: string, status = 500) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

// GET ?id=pix_char_xxx — retorna dados do pedido para o tracker/n8n
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return erro("id obrigatório", 400);

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: {
      status: true,
      nome: true,
      telefone: true,
      plano: true,
      email: true,
      estilo: true,
      letra: true,
      gerou_musica: true,
      link_pagina: true,
      link_basica: true,
      link_audio: true,
      link_mp4: true,
      song_id: true,
      data_entrega: true,
      entrega_whatsapp: true,
      entrega_email: true,
      utm_source: true,
      utm_campaign: true,
      utm_medium: true,
      utm_content: true,
      utm_term: true,
      utm_id: true,
      fbclid: true,
      ttclid: true,
      pixel_id: true,
      ip: true,
    },
  });

  // Não é PIX de música: pode ser o PIX de um upsell de vídeo. O webhook da
  // Netlify consulta aqui pelo id e decide o caminho pelo plan devolvido.
  if (!pedido) {
    const video = await prisma.pedidoVideo.findUnique({
      where: { pagamento_id: id },
      include: { pedido: { select: { nome: true, telefone: true, email: true, cpf: true } } },
    });
    if (!video) return NextResponse.json({ data: {} });
    return NextResponse.json({
      data: {
        id,
        plan:      "video",
        status:    video.status,          // pendente | pago — mesma semântica do pedido
        producao:  video.producao,
        pedido_id: video.pedido_id,       // pix_char da música, pro n8n achar o pedido
        token:     video.token,
        name:      video.pedido.nome,
        phone:     video.pedido.telefone,
        mail:      video.pedido.email,
        cpf:       video.pedido.cpf,
        valor:     video.valor != null ? Number(video.valor) : null,
      },
    });
  }

  // Mantém os mesmos nomes de campo do Apps Script
  return NextResponse.json({
    data: {
      id:                id,
      status:            pedido.status,
      name:              pedido.nome,
      phone:             pedido.telefone,
      plan:              pedido.plano,
      mail:              pedido.email,
      estilo:            pedido.estilo,
      letra:             pedido.letra,
      gerou_musica:      pedido.gerou_musica,
      link_pagina:       pedido.link_pagina,
      link_basica:       pedido.link_basica,
      link_audio:        pedido.link_audio,
      link_mp4:          pedido.link_mp4,
      song_id:           pedido.song_id,
      data_entrega:      pedido.data_entrega,
      entrega_whatsapp:  pedido.entrega_whatsapp,
      entrega_email:     pedido.entrega_email,
      utm_source:        pedido.utm_source,
      utm_campaign:      pedido.utm_campaign,
      utm_medium:        pedido.utm_medium,
      utm_content:       pedido.utm_content,
      utm_term:          pedido.utm_term,
      utm_id:            pedido.utm_id,
      fbclid:            pedido.fbclid,
      ttclid:            pedido.ttclid,
      pixel_id:          pedido.pixel_id,
      ip:                pedido.ip,
    },
  });
}

// POST — novo pedido (checkout) ou atualização de status (pagamento)
export async function POST(req: NextRequest) {
  let data: any;
  try {
    data = await req.json();
  } catch {
    return erro("JSON inválido", 400);
  }

  // action: 'update' → AbacatePay confirmou o pix, atualiza status para pago
  if (data.action === "update") {
    if (!data.id) return erro("id obrigatório", 400);

    let pedido: { recovery_id: string | null } | null = null;
    try {
      pedido = await prisma.pedido.update({
        where: { id: data.id },
        data: { status: "pago" },
        select: { recovery_id: true },
      });
    } catch (e: any) {
      // P2025 = não é pedido de música. Antes de desistir, tenta como PIX de
      // upsell de vídeo (PedidoVideo.pagamento_id). Idempotente: pago fica pago.
      if (e?.code === "P2025") {
        const video = await prisma.pedidoVideo.findUnique({
          where: { pagamento_id: data.id },
          select: { pedido_id: true, status: true },
        });
        if (!video) return ok({ message: "Pedido não encontrado, ignorado" });
        if (video.status === "pago") return ok({ message: "Vídeo já estava pago", plan: "video", skipped: true });
        await prisma.pedidoVideo.update({
          where: { pagamento_id: data.id },
          data: { status: "pago", pago_em: new Date() },
        });
        return ok({ message: "Vídeo marcado como pago", plan: "video", pedido_id: video.pedido_id });
      }
      throw e;
    }

    // Se veio de recuperação, marca o original como recuperado
    if (pedido?.recovery_id) {
      await prisma.pedido.update({
        where: { id: pedido.recovery_id },
        data: { status: "recuperado" },
      }).catch(() => null);
    }

    return ok({ message: "Status atualizado para pago" });
  }

  // action: 'rastreado' → a conversão já foi registrada na UTMify.
  // Ação própria de propósito: o 'update' acima significa "marque como pago"
  // e ignora o resto do corpo, então estendê-lo mudaria o contrato do funil.
  if (data.action === "rastreado") {
    if (!data.id) return erro("id obrigatório", 400);
    try {
      await prisma.pedido.update({
        where: { id: data.id },
        data: { rastreado: data.rastreado === false ? false : true },
      });
    } catch (e: any) {
      if (e?.code === "P2025") return ok({ message: "Pedido não encontrado, ignorado" });
      throw e;
    }
    return ok({ message: "Pedido marcado como rastreado" });
  }

  // Sem action → novo pedido vindo do checkout
  if (!data.id) return erro("id obrigatório", 400);

  await prisma.pedido.upsert({
    where: { id: data.id },
    create: {
      id:           data.id,
      nome:         data.name        || "",
      telefone:     limparTelefone(data.phone),
      email:        data.mail        || data.email || "",
      plano:        data.plan        || "",
      status:       data.status      || "pendente",
      valor:        data.amount      ? parseFloat(data.amount) : null,
      utm_source:   data.utm_source  || null,
      utm_campaign: data.utm_campaign|| null,
      utm_medium:   data.utm_medium  || null,
      utm_content:  data.utm_content || null,
      utm_term:     data.utm_term    || null,
      utm_id:       data.utm_id      || null,
      fbclid:       data.fbclid      || null,
      ttclid:       data.ttclid      || null,
      pixel_id:     data.pixel_id    || null,
      estilo:       data.estilo      || null,
      letra:        data.letra       || null,
      ip:           data.ip          || null,
      cpf:          data.cpf         || "00000000000",
      nomefiscal:   data.nomefiscal  || null,
      funil:        data.funil       || null,
      recovery_id:  data.recovery_id || null,
      data_pedido:  new Date(),
    },
    update: {
      nome:         data.name        || undefined,
      telefone:     data.phone       ? limparTelefone(data.phone) : undefined,
      email:        data.mail        || data.email || undefined,
      plano:        data.plan        || undefined,
      status:       data.status      || undefined,
      valor:        data.amount      ? parseFloat(data.amount) : undefined,
      utm_source:   data.utm_source  || undefined,
      utm_campaign: data.utm_campaign|| undefined,
      utm_medium:   data.utm_medium  || undefined,
      utm_content:  data.utm_content || undefined,
      utm_term:     data.utm_term    || undefined,
      utm_id:       data.utm_id      || undefined,
      fbclid:       data.fbclid      || undefined,
      ttclid:       data.ttclid      || undefined,
      pixel_id:     data.pixel_id    || undefined,
      estilo:       data.estilo      || undefined,
      letra:        data.letra       || undefined,
      ip:           data.ip          || undefined,
      cpf:          data.cpf         || undefined,
      nomefiscal:   data.nomefiscal  || undefined,
      funil:        data.funil       || undefined,
      recovery_id:  data.recovery_id || undefined,
    },
  });

  return ok({ message: "Pedido registrado" });
}
