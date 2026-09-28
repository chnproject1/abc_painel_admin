import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Planos da operação ES (LATAM). O sufixo indica quais ofertas do funil o cliente aceitou
// (regra em lib/es-ofertas.ts → montarPlanoEs). Um downsell só, e qual depende do que já foi pago:
//   _up2_ds1  levou o vídeo, recusou a página → comprou a página no ds1
//   _up1_ds2  levou a página, recusou o vídeo → comprou o vídeo no ds2
//   _ds3      recusou os dois → comprou os dois no ds3
// `_ds` sem número: pedidos antigos do funil EUA (combo), mantidos no filtro.
const PLANOS_US_VALIDOS = [
  "basic",
  "basic_up1",
  "basic_up2",
  "basic_up1_up2",
  "basic_up2_ds1",
  "basic_up1_ds2",
  "basic_ds3",
  "silver",
  "silver_up1",
  "silver_up2",
  "silver_up1_up2",
  "silver_up2_ds1",
  "silver_up1_ds2",
  "silver_ds3",
  "basic_ds",
  "silver_ds",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json(PLANOS_US_VALIDOS);
}
