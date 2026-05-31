import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (secret) {
    const token = req.headers.get("x-callback-secret") ?? req.nextUrl.searchParams.get("secret");
    if (token !== secret) {
      return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
    }
  }

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const { action, id } = data;
  if (!id) return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });
  if (!action) return NextResponse.json({ success: false, error: "action obrigatório" }, { status: 400 });

  try {
    if (action === "music_ready") {
      await prisma.pedido.update({
        where: { id },
        data: {
          gerou_musica: true,
          link_pagina:  data.link_pagina  || undefined,
          link_basica:  data.link_basica  || undefined,
          link_audio:   data.link_audio   || undefined,
          link_mp4:     data.link_mp4     || undefined,
          song_id:      data.song_id      || undefined,
          data_entrega: data.data_entrega ? new Date(data.data_entrega) : undefined,
          status:       "pago",
        },
      });
      return NextResponse.json({ success: true, message: "Música marcada como gerada" });
    }

    if (action === "whats_entregue") {
      await prisma.pedido.update({ where: { id }, data: { entrega_whatsapp: true } });
      return NextResponse.json({ success: true, message: "WhatsApp marcado como entregue" });
    }

    if (action === "whats_erro") {
      await prisma.pedido.update({ where: { id }, data: { entrega_whatsapp: false } });
      return NextResponse.json({ success: true, message: "WhatsApp marcado como erro" });
    }

    if (action === "email_entregue") {
      await prisma.pedido.update({ where: { id }, data: { entrega_email: true } });
      return NextResponse.json({ success: true, message: "Email marcado como entregue" });
    }

    if (action === "email_erro") {
      await prisma.pedido.update({ where: { id }, data: { entrega_email: false } });
      return NextResponse.json({ success: true, message: "Email marcado como erro" });
    }

    if (action === "erro_geracao") {
      await prisma.pedido.update({ where: { id }, data: { gerou_musica: false, erro_geracao: true } });
      return NextResponse.json({ success: true, message: "Erro de geração registrado" });
    }

    return NextResponse.json({ success: false, error: `action desconhecida: ${action}` }, { status: 400 });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });
    }
    console.error("[n8n callback]", e);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
