import { prisma } from "@/lib/prisma";
import { COLUNA_RASTREIO, COLUNA_RASTREIO_ANTERIOR, funilNovoEs } from "@/lib/es-ofertas";

/**
 * Marca (ou desmarca) o rastreio de UMA oferta do pedido. Usado pela ação
 * `rastreado` (com `oferta`) e pelo `video_rastreado` antigo. Quando a oferta
 * é a que liberou o vídeo (up2 ou ds com vídeo), espelha em PedidoVideoEs.rastreado
 * pro card "Vídeo: sem rastreio". Reenviar é inofensivo: devolve ja_estava.
 */
export async function marcarRastreio(id: string, oferta: string, valor: boolean) {
  /* O mesmo rótulo muda de produto entre os funis (up1 = página no anterior, vídeo
     no de 2026-10-30): a coluna sai do formato DESTE pedido. */
  const formato = await prisma.pedidoEs.findUnique({ where: { id }, select: { upsell: true, upsell_erro: true } });
  const mapa: Record<string, string> = formato && !funilNovoEs(formato) ? COLUNA_RASTREIO_ANTERIOR : COLUNA_RASTREIO;
  const coluna = mapa[oferta];
  if (!coluna) {
    return { success: false, error: `oferta desconhecida: ${oferta}. Válidas: ${Object.keys(COLUNA_RASTREIO).join(", ")}` };
  }
  /* Funil de 2026-10-30: vídeo (up1/ds1) marca no PedidoVideoEs; ds4 (os três)
     marca página, estilo e vídeo de uma vez. */
  if (coluna === "video" || coluna === "combo") {
    const existe = await prisma.pedidoEs.findUnique({ where: { id }, select: { id: true, video: { select: { pedido_id: true } } } });
    if (!existe) return { success: false, error: `Pedido ${id} não encontrado em PedidoEs (operação ES (LATAM))` };
    if (coluna === "combo") await prisma.pedidoEs.update({ where: { id }, data: { up1_rastreado: valor, up2_rastreado: valor } });
    if (existe.video) await prisma.pedidoVideoEs.update({ where: { pedido_id: id }, data: { rastreado: valor } });
    return { success: true, ja_estava: false, oferta, coluna, message: valor ? "Venda marcada como rastreada" : "Rastreio desmarcado" };
  }
  const atual: any = await prisma.pedidoEs.findUnique({
    where: { id },
    select: { rastreado: true, up1_rastreado: true, up2_rastreado: true, ds_rastreado: true,
              up1_status: true, up2_status: true, ds_status: true, video: { select: { pedido_id: true } } },
  });
  if (!atual) return { success: false, error: `Pedido ${id} não encontrado em PedidoEs (operação ES (LATAM))` };
  if (atual[coluna] === valor) return { success: true, ja_estava: true, oferta, coluna, message: "Já estava assim" };

  await prisma.pedidoEs.update({ where: { id }, data: { [coluna]: valor } });

  // A venda que liberou o vídeo: up2, ou o downsell quando o up2 não foi pago (ds2/ds3)
  const liberouVideo = coluna === "up2_rastreado" || (coluna === "ds_rastreado" && atual.up2_status !== "pago");
  if (liberouVideo && atual.video) {
    await prisma.pedidoVideoEs.update({ where: { pedido_id: id }, data: { rastreado: valor } });
  }
  return { success: true, ja_estava: false, oferta, coluna, message: valor ? "Venda marcada como rastreada" : "Rastreio desmarcado" };
}
