/*
  Ofertas da operação ES (LATAM), num lugar só.

  Funil: front (basic | silver) → up1 Página Premium → up2 Vídeo com fotos.
  Três downsells, um por situação, todos na mesma coluna ds_status:
    - ds1: comprou o up2 (vídeo) e recusou o up1 → oferece a Página Premium (US$ 9)
    - ds2: comprou o up1 (página) e recusou o up2 → oferece o Vídeo (US$ 18)
    - ds3: recusou os dois → Página + Vídeo juntos (US$ 18)
  Não existe coluna dizendo qual ds foi: dá pra deduzir pelo que já estava
  pago. Por isso a regra de "o que foi liberado" mora aqui e vale pra
  checkout, n8n, stats, lista, telas e rastreio (mesmos nomes: up1, up2,
  ds1, ds2, ds3).

  Puro, sem imports de servidor: usado nas rotas e nas páginas (client).
*/

export type StatusOferta = string | null | undefined;

export type OfertasEs = {
  up1_status?: StatusOferta;
  up2_status?: StatusOferta;
  ds_status?: StatusOferta;
};

export type DsTipo = "ds1" | "ds2" | "ds3";

/** Qual downsell foi (ou seria) oferecido, dado o que já estava pago. */
export function dsTipoDe(o: OfertasEs): DsTipo {
  const up1 = o.up1_status === "pago";
  const up2 = o.up2_status === "pago";
  if (up2 && !up1) return "ds1";   // tenta vender a página
  if (up1 && !up2) return "ds2";   // tenta vender o vídeo
  return "ds3";                    // os dois juntos
}

export const DS_ROTULO: Record<DsTipo, string> = {
  ds1: "Downsell 1 · só a Página Premium",
  ds2: "Downsell 2 · só o Vídeo",
  ds3: "Downsell 3 · Página + Vídeo",
};

/** O downsell é oferecido sempre que alguma das duas ofertas não foi comprada. */
export function dsFoiOfertado(o: OfertasEs): boolean {
  return o.up1_status !== "pago" || o.up2_status !== "pago";
}

/** O que o cliente tem direito de receber. */
export function liberacoes(o: OfertasEs) {
  const ds = o.ds_status === "pago";
  const pagina = o.up1_status === "pago" || (ds && o.up1_status !== "pago");
  const video  = o.up2_status === "pago" || (ds && o.up2_status !== "pago");
  return { pagina, video, ds_tipo: ds ? dsTipoDe(o) : null };
}

/** Sufixos do plano acompanham as ofertas pagas. `_ds` continua sendo o marcador do downsell. */
export function montarPlanoEs(tier: string, o: OfertasEs): string {
  let plano = tier;
  if (o.up1_status === "pago") plano += "_up1";
  if (o.up2_status === "pago") plano += "_up2";
  if (o.ds_status === "pago")  plano += "_ds";
  return plano;
}

/* Cláusulas Prisma equivalentes a `liberacoes().video`, pra stats e lista:
   comprou o up2, OU pagou um downsell que incluía o vídeo. */
export const WHERE_VIDEO_LIBERADO = {
  OR: [
    { up2_status: "pago" },
    { ds_status: "pago", NOT: { up2_status: "pago" } },
  ],
};

export const WHERE_PAGINA_LIBERADA = {
  OR: [
    { up1_status: "pago" },
    { ds_status: "pago", NOT: { up1_status: "pago" } },
  ],
};
