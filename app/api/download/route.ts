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

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":        "audio/mpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
