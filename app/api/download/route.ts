import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Não autorizado", { status: 401 });

  const url      = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "audio.mp3";

  if (!url) return new NextResponse("url obrigatória", { status: 400 });

  const res = await fetch(url);
  if (!res.ok) return new NextResponse("Erro ao buscar arquivo", { status: 502 });

  const buffer = await res.arrayBuffer();

  // Headers HTTP só aceitam Latin-1 (bytes 0–255). Nomes com emoji/acento
  // (ex.: "🎵", "João") quebram o header. Fallback ASCII + versão UTF-8 (RFC 5987).
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "audio.mp3";
  const utf8Encoded   = encodeURIComponent(filename);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":        "audio/mpeg",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`,
    },
  });
}
