import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FILTROS_ES, baseDoPeriodo } from "@/lib/es-resumo";

/**
 * Visão geral do /dashboard/es: entregas por produto e rastreio por venda.
 * As regras de cada número moram em lib/es-resumo.ts — as mesmas que montam a
 * lista no clique. Aceita os mesmos filtros de data e plano da lista.
 *
 *   GET /api/es/resumo?data=YYYY-MM-DD | desde=…&ate=… | plano=…
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Só admin" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const base = baseDoPeriodo({ data: sp.get("data"), desde: sp.get("desde"), ate: sp.get("ate"), plano: sp.get("plano") });
  const onde = (chave: string) => ({ AND: [base, FILTROS_ES[chave]()] });

  const chaves = Object.keys(FILTROS_ES);
  const contagens = await Promise.all(chaves.map((k) => prisma.pedidoEs.count({ where: onde(k) as any })));
  const n = Object.fromEntries(chaves.map((k, i) => [k, contagens[i]]));

  // Receita por venda: cada valor só conta quando AQUELA oferta foi paga
  const soma = async (chave: string, campo: "valor" | "up1_valor" | "up2_valor" | "ds_valor") => {
    const r = await prisma.pedidoEs.aggregate({ where: onde(chave) as any, _sum: { [campo]: true } });
    return Number((r._sum as any)[campo] ?? 0);
  };
  const [rFront, rUp1, rUp2, rDs1, rDs2, rDs3] = await Promise.all([
    soma("venda_front", "valor"), soma("venda_up1", "up1_valor"), soma("venda_up2", "up2_valor"),
    soma("venda_ds1", "ds_valor"), soma("venda_ds2", "ds_valor"), soma("venda_ds3", "ds_valor"),
  ]);

  const venda = (oferta: string, rotulo: string, receita: number) => ({
    oferta, rotulo, receita,
    vendas: n[`venda_${oferta}`],
    sem_rastreio: n[`sem_rastreio_${oferta}`],
    rastreadas: n[`venda_${oferta}`] - n[`sem_rastreio_${oferta}`],
  });

  return NextResponse.json({
    entregas: {
      musica: { compraram: n.musica, producao: n.musica_producao, pendente: n.musica_pendente, entregue: n.musica_entregue, erro: n.musica_erro, sem_rastreio: n.sem_rastreio_musica },
      pagina: { compraram: n.pagina, pendente: n.pagina_pendente, entregue: n.pagina_entregue, erro: n.pagina_erro, sem_rastreio: n.sem_rastreio_pagina },
      video:  { compraram: n.video, pendente: n.video_pendentes, entregue: n.video_entregue, erro: n.video_erro, sem_rastreio: n.sem_rastreio_video },
    },
    rastreio: [
      venda("front", "Frente (silver / basic)", rFront),
      venda("up1", "Up1 · página", rUp1),
      venda("up2", "Up2 · vídeo", rUp2),
      venda("ds1", "Ds1 · página", rDs1),
      venda("ds2", "Ds2 · vídeo", rDs2),
      venda("ds3", "Ds3 · página + vídeo", rDs3),
    ],
  });
}
