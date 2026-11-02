import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Troca a capa da página da música 1 (Premium e básica usam a mesma).
 *
 *   POST /api/es/pedido/<id>/capa   multipart: foto (JPG/PNG/WEBP, até 5 MB) — só ADMIN
 *
 * A página lê o `cover_url` da linha em `presentes` (Supabase), achada pelo uuid
 * que fecha o link da página. A foto sobe com nome novo (o navegador do cliente
 * não fica com a capa antiga em cache) e a antiga continua no Storage.
 */
const SUPA = (process.env.SUPABASE_PUBLIC_URL || "https://baltzukuszagxcgkfrpi.supabase.co").replace(/\/$/, "");
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await trocar(req, ctx);
  } catch (e: any) {
    console.error("[capa-es] erro:", e?.message);
    return NextResponse.json({ error: `Erro no servidor: ${e?.message ?? "desconhecido"}` }, { status: 500 });
  }
}

async function trocar(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const chave = process.env.SUPABASE_SERVICE_KEY;
  if (!chave) return NextResponse.json({ error: "Falta a variável SUPABASE_SERVICE_KEY no painel" }, { status: 500 });

  const { id } = await params;
  const pedido = await prisma.pedidoEs.findUnique({ where: { id }, select: { link_pagina: true, link_basica: true } });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  const uuid = String(pedido.link_pagina || pedido.link_basica || "").split("?")[0].replace(/\/+$/, "").split("/").pop() || "";
  if (!/^[0-9a-f-]{20,}$/i.test(uuid)) return NextResponse.json({ error: "Pedido ainda sem página" }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!foto || typeof foto === "string" || typeof (foto as Blob).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Envie a foto no campo 'foto'" }, { status: 400 });
  }
  const ext = TIPOS[foto.type];
  if (!ext) return NextResponse.json({ error: "Use JPG, PNG ou WEBP" }, { status: 400 });
  if (foto.size > MAX) return NextResponse.json({ error: "Foto maior que 5 MB" }, { status: 400 });

  const caminho = `capas/${uuid}-${Date.now()}.${ext}`;
  const auth = { apikey: chave, Authorization: `Bearer ${chave}` };
  const up = await fetch(`${SUPA}/storage/v1/object/musicas/${caminho}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": foto.type, "x-upsert": "true" },
    body: Buffer.from(await foto.arrayBuffer()),
  });
  if (!up.ok) return NextResponse.json({ error: `Supabase recusou o upload (${up.status})` }, { status: 502 });

  const cover_url = `${SUPA}/storage/v1/object/public/musicas/${caminho}`;
  const r = await fetch(`${SUPA}/rest/v1/presentes?uuid=eq.${encodeURIComponent(uuid)}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ cover_url }),
  });
  const linhas = r.ok ? await r.json().catch(() => []) : [];
  if (!r.ok || !Array.isArray(linhas) || linhas.length === 0) {
    return NextResponse.json({ error: `Foto subiu, mas a página não foi atualizada (${r.status})` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, cover_url });
}
