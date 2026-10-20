import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { reenviarBr, type ItemEnvio } from "@/lib/br-bumps";

/* POST { item?: "musica" | "pagina" | "estilo" | "video" | "tudo" } — padrão "tudo".
   Reenvia o que já foi gerado (lib/br-bumps.ts, reenviarBr). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const item = (body?.item ?? "tudo") as ItemEnvio | "tudo";
  if (!["musica", "pagina", "estilo", "video", "tudo"].includes(item)) {
    return NextResponse.json({ error: `item inválido: ${item}` }, { status: 400 });
  }

  const r = await reenviarBr(id, item);
  if (r.pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const NOME: Record<string, string> = { tudo: "música e itens já criados", musica: "música", pagina: "página", estilo: "estilo extra", video: "vídeo" };
  const enviados = Object.keys(r).filter((k) => r[k] === "disparado");
  const falhas = Object.keys(r).filter((k) => r[k] !== "disparado" && r[k] !== "nao_gerado");
  if (falhas.length) {
    return NextResponse.json({
      error: `Não enviado: ${falhas.map((k) => `${NOME[k]} (${r[k] === "sem_url" ? "webhook não configurado" : r[k]})`).join(", ")}`,
      resultado: r,
    }, { status: 502 });
  }
  if (!enviados.length) return NextResponse.json({ error: "Nada pronto para enviar ainda", resultado: r }, { status: 409 });
  return NextResponse.json({ ok: true, enviados: enviados.map((k) => NOME[k]), resultado: r });
}
