import { VIDEO_TRAVADO_MIN } from "@/lib/video-estado";

/*
  Resumo da operação ES (LATAM) — as regras de cada número da visão geral do
  /dashboard/es, num lugar só. A MESMA regra conta o número (/api/es/resumo) e
  monta a lista que abre no clique (/api/es/pedidos?filtro=<chave>), então o
  número do quadro é sempre o tamanho da lista.

  Dois blocos:
    Entregas  — por PRODUTO (o que o cliente recebe): música, página, vídeo
    Rastreio  — por VENDA (o que vai pra UTMify): frente, up1, up2, ds1, ds2, ds3

  Não existe "dentro do prazo": a entrega é no mesmo fluxo pra silver e basic,
  então tudo que está pago e não entregue é pendência.
*/

type Where = Record<string, unknown>;

/* "Não pago" INCLUINDO o vazio. No Prisma, `NOT: { campo: "pago" }` vira
   `NOT (campo = 'pago')`, que é NULL pra campo vazio — e a linha some. Um ds2
   de quem fechou a página antes do fim do funil (up2_status vazio) não
   entraria na conta. */
const naoPago = (campo: string): Where => ({ OR: [{ [campo]: null }, { [campo]: { not: "pago" } }] });

const travadoDesde = () => new Date(Date.now() - VIDEO_TRAVADO_MIN * 60000);

/* Qual downsell foi — mesma regra de dsTipoDe (lib/es-ofertas.ts) */
const DS1: Where = { ds_status: "pago", up2_status: "pago", AND: [naoPago("up1_status")] };
const DS2: Where = { ds_status: "pago", up1_status: "pago", AND: [naoPago("up2_status")] };
const DS3: Where = { ds_status: "pago", AND: [naoPago("up1_status"), naoPago("up2_status")] };

/* O que o cliente tem direito de receber — mesma regra de liberacoes() */
const PAGINA: Where = { status: "pago", OR: [{ up1_status: "pago" }, { ds_status: "pago", AND: [naoPago("up1_status")] }] };
const MUSICA_ERRO: Where = { erro_geracao: true, gerou_musica: false, entrega_email: false };

const video = (is: Where): Where => ({ status: "pago", video: { is } });

/** Chave do filtro → condição. Usado pela contagem e pela lista. */
export const FILTROS_ES: Record<string, () => Where> = {
  // ── Entregas: música (frente) ──
  musica:          () => ({ status: "pago" }),
  musica_producao: () => ({ status: "pago", gerou_musica: false, link_audio: null, erro_geracao: false }),
  musica_pendente: () => ({ status: "pago", entrega_email: false, NOT: [MUSICA_ERRO] }),   // inclusive ainda gerando
  musica_entregue: () => ({ status: "pago", entrega_email: true }),
  musica_erro:     () => ({ status: "pago", ...MUSICA_ERRO }),

  // ── Entregas: Página Premium (up1, ds1, ds3) ──
  pagina:            () => PAGINA,
  pagina_aguardando: () => ({ AND: [PAGINA], link_pagina: null, pagina_entrega_email: false }),   // esperando a música
  // Pendente = tudo que não foi entregue (inclusive esperando a música), menos erro
  pagina_pendente:   () => ({ AND: [PAGINA], pagina_entrega_email: false, NOT: [MUSICA_ERRO] }),
  pagina_entregue:   () => ({ AND: [PAGINA], pagina_entrega_email: true }),
  pagina_erro:       () => ({ AND: [PAGINA, MUSICA_ERRO], pagina_entrega_email: false }),         // a música não gerou, a página não sai

  // ── Entregas: vídeo (up2, ds2, ds3) — só pedido novo tem linha de vídeo ──
  video:            () => ({ status: "pago", video: { isNot: null } }),
  video_sem_fotos:  () => video({ producao: "aguardando_fotos" }),                                  // esperando o cliente
  video_producao:   () => video({ producao: { in: ["fotos_enviadas", "renderizando"] }, atualizado_em: { gte: travadoDesde() } }),
  // Pendente = tudo que não foi entregue (sem fotos, produzindo, pronto sem e-mail), menos erro
  video_pendentes:  () => video({ entrega_email: false, OR: [
    { producao: { in: ["aguardando_fotos", "concluido"] } },
    { producao: { in: ["fotos_enviadas", "renderizando"] }, atualizado_em: { gte: travadoDesde() } },
  ] }),
  video_entregue:   () => video({ entrega_email: true }),
  // E-mail "Sube tus fotos" não saiu — e ainda faz falta: sem fotos e sem ter aberto o link
  video_sem_confirmacao: () => video({ envio_confirmacao: false, producao: "aguardando_fotos", aberto_em: null }),
  video_erro:       () => video({ OR: [
    { producao: "erro" },
    { producao: { in: ["fotos_enviadas", "renderizando"] }, atualizado_em: { lt: travadoDesde() } },
  ] }),

  // ── Rastreio: cada venda é um pedido próprio na UTMify ──
  venda_front: () => ({ status: "pago" }),
  venda_up1:   () => ({ up1_status: "pago" }),
  venda_up2:   () => ({ up2_status: "pago" }),
  venda_ds1:   () => DS1,
  venda_ds2:   () => DS2,
  venda_ds3:   () => DS3,
  sem_rastreio_front: () => ({ status: "pago", rastreado: false }),
  sem_rastreio_up1:   () => ({ up1_status: "pago", up1_rastreado: false }),
  sem_rastreio_up2:   () => ({ up2_status: "pago", up2_rastreado: false }),
  sem_rastreio_ds1:   () => ({ AND: [DS1], ds_rastreado: false }),
  sem_rastreio_ds2:   () => ({ AND: [DS2], ds_rastreado: false }),
  sem_rastreio_ds3:   () => ({ AND: [DS3], ds_rastreado: false }),

  // ── Rastreio por PRODUTO (linha de cada produto nas entregas) ──
  // Página: veio do up1 ou de um downsell que entrega a página (ds1, ds3)
  // Vídeo:  veio do up2 ou de um downsell que entrega o vídeo (ds2, ds3)
  sem_rastreio_musica: () => ({ status: "pago", rastreado: false }),
  sem_rastreio_pagina: () => ({ OR: [
    { up1_status: "pago", up1_rastreado: false },
    { AND: [{ OR: [DS1, DS3] }], ds_rastreado: false },
  ] }),
  sem_rastreio_video: () => ({ OR: [
    { up2_status: "pago", up2_rastreado: false },
    { AND: [{ OR: [DS2, DS3] }], ds_rastreado: false },
  ] }),
};

export const ROTULO_FILTRO_ES: Record<string, string> = {
  musica: "Música: compraram", musica_producao: "Música: em produção", musica_pendente: "Música: pendente de envio",
  musica_entregue: "Música: entregue", musica_erro: "Música: erro de geração",
  pagina: "Página Premium: compraram", pagina_aguardando: "Página Premium: aguardando a música",
  pagina_pendente: "Página Premium: pendente de envio", pagina_entregue: "Página Premium: entregue", pagina_erro: "Página Premium: erro (música não gerou)",
  video: "Vídeo: compraram", video_sem_fotos: "Vídeo: aguardando fotos", video_producao: "Vídeo: em produção",
  video_pendentes: "Vídeo: pendente de envio", video_entregue: "Vídeo: entregue", video_sem_confirmacao: "Vídeo: confirmação da compra não enviada", video_erro: "Vídeo: erro",
  venda_front: "Vendas da frente", venda_up1: "Vendas do up1", venda_up2: "Vendas do up2",
  venda_ds1: "Vendas do ds1", venda_ds2: "Vendas do ds2", venda_ds3: "Vendas do ds3",
  sem_rastreio_musica: "Música: sem rastreio", sem_rastreio_pagina: "Página Premium: sem rastreio", sem_rastreio_video: "Vídeo: sem rastreio",
  sem_rastreio_front: "Frente sem rastreio", sem_rastreio_up1: "Up1 sem rastreio", sem_rastreio_up2: "Up2 sem rastreio",
  sem_rastreio_ds1: "Ds1 sem rastreio", sem_rastreio_ds2: "Ds2 sem rastreio", sem_rastreio_ds3: "Ds3 sem rastreio",
};

/** Filtro de data e plano da tela (os mesmos da lista), aplicado aos dois blocos. */
export function baseDoPeriodo(p: { data?: string | null; desde?: string | null; ate?: string | null; plano?: string | null }): Where {
  const base: Where = {};
  if (p.data) {
    // Dia no fuso de Nova York, igual à lista (/api/es/pedidos)
    base.data_pedido = { gte: new Date(`${p.data}T00:00:00-04:00`), lte: new Date(`${p.data}T23:59:59.999-04:00`) };
  } else if (p.desde || p.ate) {
    const r: Record<string, Date> = {};
    if (p.desde) r.gte = new Date(p.desde);
    if (p.ate)   r.lte = new Date(p.ate);
    base.data_pedido = r;
  }
  if (p.plano) base.plano = p.plano;
  return base;
}
