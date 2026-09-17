import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Página de recuperação no site (abc-upvideo/recuperar/). O checkout antigo
// (abcmusic-fb) não existe mais; esta rota fica só pra links já enviados.
const RECUPERAR_URL = (process.env.RECUPERAR_URL || "https://abcmusic-quiz.netlify.app/recuperar/").replace(/\/$/, "") + "/";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  const existe = await prisma.pedido.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  return NextResponse.redirect(`${RECUPERAR_URL}?p=${encodeURIComponent(id)}`, 302);
}
