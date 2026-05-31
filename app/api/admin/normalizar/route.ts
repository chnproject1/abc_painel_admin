import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any)?.role ?? "OPERADOR";
  if (role !== "ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  // 1. Email: remove espaços, corta no '?' (fbclid), trim
  const emailFix = await prisma.$executeRaw`
    UPDATE "Pedido"
    SET email = SPLIT_PART(REGEXP_REPLACE(TRIM(email), '\s+', '', 'g'), '?', 1)
    WHERE email ~ '\s'
       OR email LIKE '%?%'
       OR email <> TRIM(email)
  `;

  // 2. Telefone: mantém só dígitos
  const telFix = await prisma.$executeRaw`
    UPDATE "Pedido"
    SET telefone = REGEXP_REPLACE(telefone, '[^0-9]', '', 'g')
    WHERE telefone ~ '[^0-9]'
  `;

  // 3. Nome: remove espaços nas pontas
  const nomeFix = await prisma.$executeRaw`
    UPDATE "Pedido"
    SET nome = TRIM(nome)
    WHERE nome <> TRIM(nome)
  `;

  return NextResponse.json({
    ok: true,
    atualizados: {
      emails: Number(emailFix),
      telefones: Number(telFix),
      nomes: Number(nomeFix),
    },
  });
}
