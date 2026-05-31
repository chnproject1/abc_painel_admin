import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Planos válidos em ordem crescente de valor
const PLANOS_VALIDOS = ["basic", "silver", "bump", "gold"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json(PLANOS_VALIDOS);
}
