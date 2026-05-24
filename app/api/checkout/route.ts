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
      utm_source: true,
      utm_campaign: true,
      utm_medium: true,
      utm_content: true,
      utm_term: true,
      utm_id: true,
      fbclid: true,
      ip: true,
    },
  });

  if (!pedido) return NextResponse.json({ data: {} });

  // Mantém os mesmos nomes de campo do Apps Script
  return NextResponse.json({
    data: {
      id:           id,
      status:       pedido.status,
      name:         pedido.nome,
      phone:        pedido.telefone,
      plan:         pedido.plano,
      mail:         pedido.email,
      estilo:       pedido.estilo,
      letra:        pedido.letra,
      utm_source:   pedido.utm_source,
      utm_campaign: pedido.utm_campaign,
      utm_medium:   pedido.utm_medium,
      utm_content:  pedido.utm_content,
      utm_term:     pedido.utm_term,
      utm_id:       pedido.utm_id,
      fbclid:       pedido.fbclid,
      ip:           pedido.ip,
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

    await prisma.pedido.update({
      where: { id: data.id },
      data: { status: "pago" },
    });

    return ok({ message: "Status atualizado para pago" });
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
      estilo:       data.estilo      || null,
      letra:        data.letra       || null,
      ip:           data.ip          || null,
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
      estilo:       data.estilo      || undefined,
      letra:        data.letra       || undefined,
      ip:           data.ip          || undefined,
    },
  });

  return ok({ message: "Pedido registrado" });
}
