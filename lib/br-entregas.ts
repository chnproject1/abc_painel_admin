import { estadoVideo, ehVideoLetraBr, type VideoResumo } from "@/lib/video-estado";

/*
  ENTREGAS DO PEDIDO BR — a regra das cores, num lugar só. Puro (sem servidor):
  a página do pedido pinta as linhas com ela, e o início (/api/stats) e as listas
  (/api/pedidos?filtro=bump_<item>_<estado>) contam com ela — o número do quadro
  é sempre o que aparece vermelho/amarelo/verde no pedido.

    verde    gerado e enviado, sem erro em nenhum canal
    amarelo  gerado, mas o envio deu erro em algum canal ou não saiu
    vermelho pago e nada gerado depois do prazo (erro de produção)
    cinza    ainda em produção, no prazo normal

  O envio de cada canal vem dos tokens de bumps_enviados (lib/br-bumps.ts):
  "estilo.whats" = entregue, "video.email!" = erro.
*/

export type EstadoCanal = "ok" | "erro" | null;
export type Cor = "verde" | "amarelo" | "vermelho" | "cinza";
export type ItemEntrega = "musica" | "pagina" | "estilo" | "video";

export type PedidoEntregaBr = {
  status: string;
  bumps?: string | null;
  bumps_enviados?: string | null;
  estilo2?: string | null;
  gerou_musica?: boolean | null;
  link_audio?: string | null;
  link_pagina?: string | null;
  link_audio2?: string | null;
  link_pagina2?: string | null;
  data_entrega?: string | Date | null;
  entrega_whatsapp?: boolean | null;
  entrega_email?: boolean | null;
  video?: (VideoResumo & { link?: string | null }) | null;
};

export type LinhaEntrega = {
  item: ItemEntrega; rotulo: string; gerado: boolean; cor: Cor; texto: string;
  whats: EstadoCanal; email: EstadoCanal; href?: string | null;
};

// a 2ª música sai depois da principal: o Suno leva alguns minutos
const PRAZO_ESTILO_MIN = 30;

/** "video:29.90,estilo:24.90" → { video: "29.90", estilo: "24.90" } */
export function bumpsMapa(bumps?: string | null): Record<string, string> {
  return Object.fromEntries(String(bumps || "").split(",").filter(Boolean).map((b) => b.split(":") as [string, string]));
}

/** Estado de um canal pelos tokens; `legado` = a coluna antiga já diz entregue. */
export function estadoCanal(bumpsEnviados: string | null | undefined, item: string, canal: "whats" | "email", legado = false): EstadoCanal {
  const t = String(bumpsEnviados || "").split(",");
  if (t.includes(`${item}.${canal}!`)) return "erro";
  return t.includes(`${item}.${canal}`) || legado || (canal === "whats" && t.includes(item)) ? "ok" : null;
}

/** As linhas de Entregas do pedido, com a cor. `producao`: "erro" ou o texto do que está em andamento. */
export function linhasEntregaBr(p: PedidoEntregaBr, agora = Date.now()): LinhaEntrega[] {
  const bumps = bumpsMapa(p.bumps);
  const pago = p.status === "pago";
  const v = p.video;
  const musicaGerada = !!(p.gerou_musica || p.link_audio || p.link_pagina);
  const semMusica = pago ? "erro" : "Aguardando o pagamento";
  const minDesdeMusica = p.data_entrega ? (agora - new Date(p.data_entrega).getTime()) / 60000 : null;
  const ev = v ? estadoVideo(v) : null;
  const canal = (item: string, c: "whats" | "email", legado = false) => estadoCanal(p.bumps_enviados, item, c, legado);

  const brutas: (Omit<LinhaEntrega, "cor" | "texto"> & { mostra: boolean; producao: string | null })[] = [
    { item: "musica", rotulo: "Música", mostra: true, gerado: musicaGerada, producao: semMusica,
      whats: canal("musica", "whats", !!p.entrega_whatsapp), email: canal("musica", "email", !!p.entrega_email) },
    { item: "pagina", rotulo: "Página Premium — bump", mostra: !!bumps.pagina, gerado: !!p.link_pagina, href: p.link_pagina,
      producao: semMusica, whats: canal("pagina", "whats"), email: canal("pagina", "email") },
    { item: "estilo", rotulo: `Estilo extra${p.estilo2 ? ` (${p.estilo2})` : ""} — bump`, mostra: !!bumps.estilo,
      gerado: !!p.link_audio2, href: p.link_pagina2 || p.link_audio2,
      producao: !musicaGerada ? (pago ? "Aguardando a música principal" : "Aguardando o pagamento")
        : minDesdeMusica !== null && minDesdeMusica < PRAZO_ESTILO_MIN ? "Gerando a 2ª música" : "erro",
      whats: canal("estilo", "whats"), email: canal("estilo", "email") },
    { item: "video", rotulo: ehVideoLetraBr(v?.opcoes) || bumps.video ? "Vídeo com letra — bump" : "Vídeo com fotos — upsell",
      mostra: !!bumps.video || v?.status === "pago", gerado: v?.producao === "concluido", href: v?.link,
      producao: !v ? (pago ? "erro" : "Aguardando o pagamento") : ev?.chave === "erro" ? "erro" : ev?.rotulo ?? null,
      whats: canal("video", "whats", !!v?.entrega_whatsapp), email: canal("video", "email") },
  ];

  return brutas.filter((l) => l.mostra).map(({ mostra, producao, ...l }) => {
    const [cor, texto]: [Cor, string] = !l.gerado
      ? producao === "erro" ? ["vermelho", "✕ Pago — nada gerado"] : ["cinza", `⏳ ${producao ?? "Em produção"}`]
      : l.whats === "erro" || l.email === "erro" ? ["amarelo", "● Gerado — erro no envio"]
      : l.whats === "ok" || l.email === "ok" ? ["verde", "✓ Entregue"]
      : ["amarelo", "● Gerado — não enviado"];
    return { ...l, cor, texto };
  });
}

/* ── Início do painel: os bumps por item ── */
export const ITENS_BUMP = ["pagina", "estilo", "video"] as const;
export type CorteBump = "todos" | "entregue" | "pendente" | "erro";

/** Em que cortes do início o pedido entra para um bump. Pendente/erro só com o pedido pago
    ("cancelado" = contato inválido: conta na compra, sai dos alertas). */
export function cortesBumpBr(p: PedidoEntregaBr, item: (typeof ITENS_BUMP)[number], agora = Date.now()): CorteBump[] {
  if (!bumpsMapa(p.bumps)[item]) return [];
  const l = linhasEntregaBr(p, agora).find((x) => x.item === item);
  const cortes: CorteBump[] = ["todos"];
  if (l?.cor === "verde") cortes.push("entregue");
  if (p.status === "pago" && l?.cor === "amarelo") cortes.push("pendente");
  if (p.status === "pago" && l?.cor === "vermelho") cortes.push("erro");
  return cortes;
}
