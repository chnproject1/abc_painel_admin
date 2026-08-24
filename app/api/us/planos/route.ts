import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Planos da operação US. O sufixo indica quais ofertas do funil o cliente aceitou.
// O downsell só é oferecido quando up1 e up2 são recusados, por isso nunca aparece
// combinado com eles.
const PLANOS_US_VALIDOS = [
  "basic",
  "basic_up1",
  "basic_up2",
  "basic_up1_up2",
  "basic_ds",
  "silver",
  "silver_up1",
  "silver_up2",
  "silver_up1_up2",
  "silver_ds",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json(PLANOS_US_VALIDOS);
}
