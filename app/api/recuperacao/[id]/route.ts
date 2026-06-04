import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CHECKOUT_URL = "https://abcmusic-fb.netlify.app/";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: {
      id:           true,
      nome:         true,
      telefone:     true,
      email:        true,
      plano:        true,
      estilo:       true,
      letra:        true,
      cpf:          true,
      nomefiscal:   true,
      utm_source:   true,
      utm_campaign: true,
      utm_medium:   true,
      utm_content:  true,
      utm_term:     true,
      utm_id:       true,
      fbclid:       true,
    },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const p = (v: string | null | undefined) =>
    encodeURIComponent(v ?? "");

  const url =
    `${CHECKOUT_URL}?` +
    `plan=${p(pedido.plano)}` +
    `&name=${p(pedido.nome)}` +
    `&phone=${p(pedido.telefone)}` +
    `&estilo=${p(pedido.estilo)}` +
    `&letra=${p(pedido.letra)}` +
    `&email=${p(pedido.email)}` +
    `&cpf=${p(pedido.cpf)}` +
    `&nomefiscal=${p(pedido.nomefiscal)}` +
    `&utm_source=${p(pedido.utm_source)}` +
    `&utm_campaign=${p(pedido.utm_campaign)}` +
    `&utm_medium=${p(pedido.utm_medium)}` +
    `&utm_content=${p(pedido.utm_content)}` +
    `&utm_term=${p(pedido.utm_term)}` +
    `&utm_id=${p(pedido.utm_id)}` +
    `&fbclid=${p(pedido.fbclid)}` +
    `&recovery_id=${p(pedido.id)}`;

  return NextResponse.redirect(url, 302);
}
