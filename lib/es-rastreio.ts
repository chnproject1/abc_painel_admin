import { prisma } from "@/lib/prisma";
import { COLUNA_RASTREIO } from "@/lib/es-ofertas";

/**
 * Marca (ou desmarca) o rastreio de UMA oferta do pedido. Usado pela ação
 * `rastreado` (com `oferta`) e pelo `video_rastreado` antigo. Quando a oferta
 * é a que liberou o vídeo (up2 ou ds com vídeo), espelha em PedidoVideoEs.rastreado
 * pro card "Vídeo: sem rastreio". Reenviar é inofensivo: devolve ja_estava.
 */
export async function marcarRastreio(id: string, oferta: string, valor: boolean) {
  const coluna = (COLUNA_RASTREIO as Record<string, string>)[oferta];
  if (!coluna) {
    return { success: false, error: `oferta desconhecida: ${oferta}. Válidas: ${Object.keys(COLUNA_RASTREIO).join(", ")}` };
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
