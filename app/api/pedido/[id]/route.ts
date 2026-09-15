import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectPorRole } from "@/lib/columns";
import { linkVideo, urlPublica } from "@/lib/video";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as any).role ?? "OPERADOR";

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: selectPorRole(role),
  });

  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Upsell de vídeo, se existir. Só leitura: a atendente pega o link e o
  // arquivo daqui; o vídeo não é ajustado no painel.
  const video = await prisma.pedidoVideo.findUnique({
    where: { pedido_id: id },
    select: {
      token: true, status: true, producao: true, fotos: true, valor: true,
      video_path: true, entrega_whatsapp: true, erro_msg: true, tentativas: true, rastreado: true,
      enviado_em: true, aberto_em: true, fotos_em: true, pago_em: true, concluido_em: true, atualizado_em: true,
    },
  });

  return NextResponse.json({
    ...pedido,
    video: video ? {
      ...video,
      valor: video.valor != null ? Number(video.valor) : null,
      fotos_qtd: Array.isArray(video.fotos) ? (video.fotos as unknown[]).length : 0,
      fotos: undefined,
      link: linkVideo(video.token),
      video_url: urlPublica(video.video_path),
    } : null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Operador só pode editar a letra; admin pode editar mais campos
  const role = (session.user as any).role ?? "OPERADOR";
  const camposPermitidos =
    role === "ADMIN"
      ? ["letra", "status", "estilo", "gerou_musica", "link_pagina", "link_basica", "link_audio", "song_id", "data_entrega", "entrega_whatsapp", "entrega_email", "link_mp4", "nome", "telefone", "email"]
      : ["letra", "estilo"]; // OPERADOR e PRODUTOR

  const update: any = {};
  for (const campo of camposPermitidos) {
    if (campo in body) update[campo] = body[campo];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido para atualizar" }, { status: 400 });
  }

  const pedido = await prisma.pedido.update({
    where: { id },
    data: update,
  });

  return NextResponse.json(pedido);
}
