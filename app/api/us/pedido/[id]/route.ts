import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectPorRoleUs } from "@/lib/columns";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as any).role ?? "OPERADOR";

  const pedido = await prisma.pedidoUs.findUnique({
    where: { id },
    select: selectPorRoleUs(role),
  });

  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  return NextResponse.json(pedido);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Operador e produtor só editam a letra e o estilo; admin edita os campos operacionais
  const role = (session.user as any).role ?? "OPERADOR";
  const camposPermitidos =
    role === "ADMIN"
      ? [
          "letra", "estilo", "idioma", "status", "nome", "email",
          "gerou_musica", "erro_geracao", "song_id",
          "link_pagina", "link_basica", "link_audio", "link_mp4",
          "data_entrega", "entrega_email",
          "up_gerou_musica", "up_erro_geracao",
          "song_id2", "link_pagina2", "link_basica2", "link_audio2",
          "song_id3", "link_pagina3", "link_basica3", "link_audio3",
          "up_data_entrega", "up_entrega_email",
        ]
      : ["letra", "estilo"]; // OPERADOR e PRODUTOR

  const update: any = {};
  for (const campo of camposPermitidos) {
    if (campo in body) update[campo] = body[campo];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido para atualizar" }, { status: 400 });
  }

  try {
    const pedido = await prisma.pedidoUs.update({ where: { id }, data: update });
    return NextResponse.json(pedido);
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    throw e;
  }
}
