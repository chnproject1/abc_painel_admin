/*
  Ofertas da operação ES (LATAM), num lugar só.

  Funil: front (basic | silver) → up1 Página Premium → up2 Estilo extra.
  Três downsells, um por situação, todos na mesma coluna ds_status:
    - ds1: comprou o up2 (estilo) e recusou o up1 → oferece a Página Premium (US$ 9)
    - ds2: comprou o up1 (página) e recusou o up2 → oferece o Estilo (US$ 8)
    - ds3: recusou os dois → Página + Estilo juntos (US$ 8)

  Até out/2026 o up2 (e o ds2/ds3) era o VÍDEO com fotos. Os nomes das ofertas
  não mudaram (up2, ds2, ds3 — rastreio e plano iguais); o que diz se o pedido
  levou o estilo ou o vídeo é a coluna `estilo2`: preenchida = estilo. O vídeo
  continua no código pra voltar como order bump.
  Não existe coluna dizendo qual ds foi: dá pra deduzir pelo que já estava
  pago. Por isso a regra de "o que foi liberado" mora aqui e vale pra
  checkout, n8n, stats, lista, telas e rastreio (mesmos nomes: up1, up2,
  ds1, ds2, ds3).

  Puro, sem imports de servidor: usado nas rotas e nas páginas (client).
*/

/* ── Funil de 2026-10-30 (QUIZ ES V2 e recuperação) ─────────────────────
   up1 vídeo com letra → ds1 · up2 página → ds2 · up3 estilo → ds3 · ds4 os três
   (só pra quem não comprou nenhum). Cada compra entra em `upsell` com um NOME
   PRÓPRIO (abaixo), que não colide com os nomes antigos — assim o pedido novo é
   reconhecido e nada é deduzido: o que foi comprado é o que é entregue.
   No painel o registro é por PRODUTO: vídeo → bump1 ('video') · página →
   up1_status/up1_valor · estilo → up2_status/up2_valor (+ estilo2). O
   ds_status fica só pros pedidos antigos. */
export const OFERTA_DO_PRODUTO = {
  video_up: "up1", video_ds: "ds1",
  pagina_up: "up2", pagina_ds: "ds2",
  estilo_up: "up3", estilo_ds: "ds3",
  combo4: "ds4",
} as const;
export type ProdutoNovo = keyof typeof OFERTA_DO_PRODUTO;
const ehProdutoNovo = (p: string): p is ProdutoNovo => p in OFERTA_DO_PRODUTO;
const listaUpsell = (v?: string | null) => String(v ?? "").split(",").map((x) => x.trim().replace(/-teste$/, "")).filter(Boolean);

/** Pedido do funil de 2026-10-30: comprou ou recusou alguma oferta com nome novo. */
export function funilNovoEs(o: { upsell?: string | null; upsell_erro?: string | null }): boolean {
  return [...listaUpsell(o.upsell), String(o.upsell_erro ?? "").split(":")[0].replace(/-teste$/, "")].some(ehProdutoNovo);
}

/** Funil novo: por qual oferta cada produto entrou (null = não comprou). */
export function ofertasPorProduto(o: { upsell?: string | null }) {
  const comprados = listaUpsell(o.upsell).filter(ehProdutoNovo);
  const de = (...ps: ProdutoNovo[]) => {
    const p = comprados.find((x) => ps.includes(x));
    return p ? OFERTA_DO_PRODUTO[p] : null;
  };
  return {
    video:  de("video_up", "video_ds", "combo4"),
    pagina: de("pagina_up", "pagina_ds", "combo4"),
    estilo: de("estilo_up", "estilo_ds", "combo4"),
  };
}

export type StatusOferta = string | null | undefined;

export type OfertasEs = {
  status?: StatusOferta;           // venda da frente (o bump vai junto dela)
  up1_status?: StatusOferta;
  up2_status?: StatusOferta;
  ds_status?: StatusOferta;
  estilo2?: string | null;
  bump1?: string | null;           // order bump 1 do checkout: "video" | "video,lookalike"
  bump2?: string | null;           // order bump 2 do checkout (livre, próximo produto)
  upsell?: string | null;          // produtos pagos (funil de 2026-10-30: nomes de OFERTA_DO_PRODUTO)
  upsell_erro?: string | null;
};

/* Order 1 = vídeo com a letra animada + até 15 fotos na moldura ("video"; os pedidos
   antigos têm "video,lookalike", do tempo do +US$3). Cobrado junto com a música, então está pago quando o pedido está pago.
   O nome interno "cartoon"/"lookalike" ficou do primeiro formato do vídeo. */
export const ESPERA_FOTOS_MIN = 120;   // Plus: espera as fotos até isso; depois o vídeo sai sem fotos
export function bumpTem(o: OfertasEs, item: "video" | "lookalike"): boolean {
  // cada bump pode trazer mais de um item (bump1 = "video,lookalike")
  return [o.bump1, o.bump2].flatMap((b) => String(b || "").split(",")).some((x) => x.trim() === item);
}

export type DsTipo = "ds1" | "ds2" | "ds3";

/** Qual downsell foi (ou seria) oferecido, dado o que já estava pago. */
export function dsTipoDe(o: OfertasEs): DsTipo {
  // o nome gravado em `upsell` vale mais que a dedução (ver liberacoes)
  const nome = listaUpsell(o.upsell).find((x) => /^ds[123]$/.test(x));
  if (nome) return nome as DsTipo;
  const up1 = o.up1_status === "pago";
  const up2 = o.up2_status === "pago";
  if (up2 && !up1) return "ds1";   // tenta vender a página
  if (up1 && !up2) return "ds2";   // tenta vender o vídeo
  return "ds3";                    // os dois juntos
}

export const DS_ROTULO: Record<DsTipo, string> = {
  ds1: "Downsell 1 · só a Página Premium",
  ds2: "Downsell 2 · só o Estilo (antes: Vídeo)",
  ds3: "Downsell 3 · Página + Estilo (antes: Vídeo)",
};

/** O downsell é oferecido sempre que alguma das duas ofertas não foi comprada. */
export function dsFoiOfertado(o: OfertasEs): boolean {
  return o.up1_status !== "pago" || o.up2_status !== "pago";
}

/** O que o cliente tem direito de receber. */
export function liberacoes(o: OfertasEs) {
  const ds = o.ds_status === "pago";
  /* Qual downsell foi: o NOME gravado em `upsell` vale mais que a dedução pelos
     status. ds1 sempre foi só a página; ds2 só o 2º produto; ds3 os dois. Sem o
     nome (pedidos antigos do US) cai na dedução de antes. Corrige o funil de
     29/10, que oferecia o ds1 logo depois da página recusada. */
  const dsNome = listaUpsell(o.upsell).find((x) => /^ds[123]$/.test(x));
  const dsPagina = ds && (dsNome ? dsNome !== "ds2" : o.up1_status !== "pago");
  const dsExtra  = ds && (dsNome ? dsNome !== "ds1" : o.up2_status !== "pago");
  const pagina = o.up1_status === "pago" || dsPagina;
  // O 2º produto do funil (up2, ou o ds2/ds3): estilo nos pedidos novos, vídeo nos antigos
  const extra  = o.up2_status === "pago" || dsExtra;
  const estilo = extra && !!o.estilo2;
  /* Vídeo com fotos (o up2 antigo): nunca no funil de 2026-10-30, que não vende
     esse produto — lá o vídeo é o com letra (bump1), em video_cartoon abaixo. */
  const video  = extra && !o.estilo2 && !funilNovoEs(o);
  // Vídeo com letra (Order 1): só a música principal vira vídeo — nunca a do estilo extra
  const video_cartoon = o.status === "pago" && bumpTem(o, "video");
  // Desde 2026-10-16 o vídeo vem SEMPRE com as fotos (até 15): o +US$3 do Plus saiu.
  // "lookalike" no bump1 só aparece nos pedidos antigos e dá no mesmo.
  const lookalike = video_cartoon;
  return { pagina, video, estilo, video_cartoon, lookalike, ds_tipo: ds ? dsTipoDe(o) : null };
}

/** Sufixos do plano acompanham as ofertas pagas. O downsell entra com o número
 *  (`_ds1` | `_ds2` | `_ds3`), pra o plano dizer QUAL foi — ex.: basic_up2_ds1.
 *  `_ds` sem número só existe nos pedidos antigos do funil EUA (combo). */
export function montarPlanoEs(tier: string, o: OfertasEs): string {
  let plano = tier;
  if (o.up1_status === "pago") plano += "_up1";
  if (o.up2_status === "pago") plano += "_up2";
  if (o.ds_status === "pago")  plano += "_" + dsTipoDe(o);
  return plano;
}

/* Cláusulas Prisma equivalentes a `liberacoes().video`, pra stats e lista:
   comprou o up2, OU pagou um downsell que incluía o vídeo. */
/* "Não pago" com o vazio incluído: `NOT: { up2_status: "pago" }` deixava de
   fora quem tem up2_status NULL (fechou a página antes do fim do funil). */
export const WHERE_VIDEO_LIBERADO = {
  OR: [
    { up2_status: "pago" },
    { ds_status: "pago", OR: [{ up2_status: null }, { up2_status: { not: "pago" } }] },
  ],
};

export const WHERE_PAGINA_LIBERADA = {
  OR: [
    { up1_status: "pago" },
    { ds_status: "pago", OR: [{ up1_status: null }, { up1_status: { not: "pago" } }] },
  ],
};

/* ── Rastreio por oferta ──────────────────────────────────────────────
   Cada oferta é um pedido próprio na UTMify (<id>, <id>_up1, _up2, _ds1…) e
   tem o próprio campo "já registrado". O fluxo de rastreio marca com
   { action: "rastreado", oferta } — os nomes são os que o rastreio-api usa. */
/* Funil de 2026-10-30: o rótulo diz o PRODUTO. up1/ds1 = vídeo (marca no
   PedidoVideoEs), up2/ds2 = página (up1_rastreado), up3/ds3 = estilo
   (up2_rastreado), ds4 = os três. "video" e "combo" são tratados em
   lib/es-rastreio.ts. Os pedidos antigos (up1 = página, up2 = estilo, um
   downsell só) já foram todos registrados com os nomes de antes. */
export const COLUNA_RASTREIO = {
  front: "rastreado",
  up1:   "video",
  ds1:   "video",
  up2:   "up1_rastreado",
  ds2:   "up1_rastreado",
  up3:   "up2_rastreado",
  ds3:   "up2_rastreado",
  ds4:   "combo",
  ds:    "ds_rastreado",
} as const;

export type OfertaRastreio = keyof typeof COLUNA_RASTREIO;

/** Pedido com ALGUMA oferta paga e ainda não registrada na UTMify. */
export const WHERE_SEM_RASTREIO = {
  OR: [
    { status: "pago",     rastreado: false },
    { up1_status: "pago", up1_rastreado: false },
    { up2_status: "pago", up2_rastreado: false },
    { ds_status: "pago",  ds_rastreado: false },
  ],
};
