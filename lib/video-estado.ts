/*
  Estado do upsell de vídeo pra exibição no painel. Puro, sem imports de
  servidor: é usado tanto nas rotas quanto nas páginas (client).

  A tabela tem venda (status) e produção (producao) separadas, e a produção
  pode ficar presa: um render que morre no meio deixa 'renderizando' pra
  sempre, e um pagamento que o n8n não pegou deixa 'fotos_enviadas'. Aqui
  isso vira "erro" depois de VIDEO_TRAVADO_MIN minutos sem atualização,
  pra aparecer no card vermelho junto com os erros de verdade.
*/

export const VIDEO_TRAVADO_MIN = 20;
// ES: o vídeo com letra grava a música inteira (~5–15 min na VPS, mais a fila)
export const VIDEO_TRAVADO_MIN_ES = 60;

/* BR tem dois vídeos (um por pedido):
     order bump (no Pix da música)  vídeo COM LETRA  — opcoes.modelo = "letra", nasce pago
                                     esperando fotos; sai sozinho sem fotos depois de 2 h
     upsell (/upvideo, Pix próprio)  vídeo SÓ DE FOTOS — o de sempre */
export const ESPERA_FOTOS_BR_MIN = 120;
// a rotina "Reprocessa Bumps" roda a cada 10 min: passou disso, é porque não pegou
const BUMP_ATRASADO_MIN = ESPERA_FOTOS_BR_MIN + 30;

export function ehVideoLetraBr(opcoes: unknown): boolean {
  return !!opcoes && typeof opcoes === "object" && (opcoes as any).modelo === "letra";
}

/** Filtro Prisma de "vídeo BR com erro" (lista e contador do painel), com a mesma regra do estadoVideo. */
export function filtroVideoErroBr(agora = Date.now()) {
  const antes = (m: number) => new Date(agora - m * 60000);
  const letra = { opcoes: { path: ["modelo"], equals: "letra" } };
  return {
    status: "pago",
    OR: [
      { producao: "erro" },
      { producao: "renderizando", atualizado_em: { lt: antes(VIDEO_TRAVADO_MIN) }, NOT: letra },
      { producao: { in: ["fotos_enviadas", "aguardando_fotos"] }, pago_em: { lt: antes(VIDEO_TRAVADO_MIN) }, NOT: letra },
      { AND: [letra], producao: { in: ["renderizando", "fotos_enviadas"] }, atualizado_em: { lt: antes(VIDEO_TRAVADO_MIN_ES) } },
      { AND: [letra], producao: "aguardando_fotos", criado_em: { lt: antes(BUMP_ATRASADO_MIN) } },
    ],
  };
}

export type VideoResumo = {
  status: string;
  producao: string;
  entrega_whatsapp: boolean;
  erro_msg?: string | null;
  atualizado_em?: string | Date | null;
  pago_em?: string | Date | null;
  concluido_em?: string | Date | null;
  fotos_em?: string | Date | null;
  opcoes?: unknown;                  // { modelo: "letra" } = vídeo com letra do order bump
  criado_em?: string | Date | null;
};

export type ChaveEstadoVideo =
  | "sem_fotos"        // link enviado, cliente não subiu fotos
  | "nao_pagou"        // fotos enviadas, PIX não pago
  | "renderizando"     // pago, vídeo sendo feito (ou esperando o n8n pegar)
  | "erro"             // pago e travou, ou o render falhou
  | "pendente_envio"   // vídeo pronto, WhatsApp não saiu
  | "entregue";        // pronto e enviado

export type EstadoVideo = { chave: ChaveEstadoVideo; rotulo: string; detalhe: string; cor: string };

function minutosDesde(d?: string | Date | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : Math.round((Date.now() - t) / 60000);
}

export function estadoVideo(v: VideoResumo): EstadoVideo {
  const cinza    = "bg-gray-100 text-gray-600";
  const verde    = "bg-green-100 text-green-700";
  const amarelo  = "bg-yellow-100 text-yellow-800";
  const vermelho = "bg-red-100 text-red-700";
  const azul     = "bg-blue-100 text-blue-700";

  if (v.status !== "pago") {
    if (v.producao === "fotos_enviadas") return { chave: "nao_pagou", rotulo: "Fotos enviadas, não pagou", detalhe: "O cliente subiu as fotos mas não concluiu o PIX.", cor: cinza };
    return { chave: "sem_fotos", rotulo: "Link enviado, sem fotos", detalhe: "O cliente ainda não subiu as fotos.", cor: cinza };
  }

  if (v.producao === "erro") {
    return { chave: "erro", rotulo: "Erro de geração", detalhe: v.erro_msg ? `O render falhou: ${v.erro_msg}` : "O render falhou.", cor: vermelho };
  }

  if (v.producao === "concluido") {
    if (v.entrega_whatsapp) return { chave: "entregue", rotulo: "Entregue", detalhe: "Vídeo pronto e enviado no WhatsApp.", cor: verde };
    return { chave: "pendente_envio", rotulo: "Pendente envio", detalhe: "Vídeo pronto, mas o WhatsApp não saiu. Baixe e envie pelo botão abaixo.", cor: amarelo };
  }

  // Vídeo com letra do order bump: já nasce pago esperando as fotos (até 2 h), e o render é mais longo
  const letra = ehVideoLetraBr(v.opcoes);
  const travadoMin = letra ? VIDEO_TRAVADO_MIN_ES : VIDEO_TRAVADO_MIN;
  if (letra && v.producao === "aguardando_fotos") {
    const min = minutosDesde(v.criado_em);
    if (min !== null && min > BUMP_ATRASADO_MIN) {
      return { chave: "erro", rotulo: "Erro de geração", detalhe: `Sem fotos há ${Math.round(min / 60)} h e o vídeo não saiu sozinho. Confira se o Power Automate "BR - Reprocessa Bumps" está rodando, ou mande pra produção.`, cor: vermelho };
    }
    const sai = v.criado_em ? new Date(new Date(v.criado_em).getTime() + ESPERA_FOTOS_BR_MIN * 60000) : null;
    return { chave: "sem_fotos", rotulo: "Aguardando fotos", detalhe: `O cliente ainda não enviou as fotos.${sai ? ` Se não enviar, o vídeo sai sem fotos às ${sai.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : ""}`, cor: cinza };
  }

  if (v.producao === "renderizando") {
    const min = minutosDesde(v.atualizado_em);
    if (min !== null && min > travadoMin) {
      return { chave: "erro", rotulo: "Erro de geração", detalhe: `Travado em "renderizando" há ${min} min. O container parou no meio; dispare o vídeo de novo no n8n.`, cor: vermelho };
    }
    return { chave: "renderizando", rotulo: "Renderizando", detalhe: "O vídeo está sendo feito agora. Leva alguns minutos.", cor: azul };
  }

  // pago mas a produção ainda não começou (fotos_enviadas / aguardando_fotos)
  /* O relógio aqui é "há quanto tempo nada acontece", não "há quanto tempo
     foi pago". Quando o vídeo volta pra fila — pelo botão do painel ou pelo
     `video_regerar` do n8n — `pago_em` continua lá atrás, e usar só ele
     devolvia o card pro vermelho no mesmo instante do reenvio: o botão
     reaparecia e dava pra enfileirar o mesmo pedido várias vezes.
     `atualizado_em` é @updatedAt, então marca o momento do reenvio. */
  const ts = [v.pago_em, v.atualizado_em]
    .map((d) => (d ? new Date(d).getTime() : NaN))
    .filter((t) => !isNaN(t));
  const min = minutosDesde(ts.length ? new Date(Math.max(...ts)) : null);

  if (min !== null && min > travadoMin) {
    return { chave: "erro", rotulo: "Erro de geração", detalhe: `Na fila há ${min} min e o render nunca começou. A produção não pegou o pedido; mande de novo pra produção.`, cor: vermelho };
  }
  return { chave: "renderizando", rotulo: "Aguardando render", detalhe: "Pagamento confirmado, esperando o render começar.", cor: azul };
}

export const PRODUCAO_LABEL: Record<string, string> = {
  aguardando_fotos: "Aguardando fotos",
  fotos_enviadas:   "Fotos enviadas",
  renderizando:     "Renderizando",
  concluido:        "Concluído",
  erro:             "Erro",
};

/* ── Operação ES (PedidoVideoEs) ──────────────────────────────────────
   Mesma leitura do BR sem a parte da venda: no ES a linha de vídeo só existe
   quando o vídeo já foi pago (up2, ds2 ou ds3). Entrega por e-mail. Usado na
   lista (/dashboard/es) e na página do pedido ES. */
export type VideoResumoEs = {
  producao: string;
  entrega_email: boolean;
  erro_msg?: string | null;
  atualizado_em?: string | Date | null;
};

export function estadoVideoEs(v: VideoResumoEs): EstadoVideo {
  const cinza = "bg-gray-100 text-gray-600", verde = "bg-green-100 text-green-700", amarelo = "bg-yellow-100 text-yellow-800",
        vermelho = "bg-red-100 text-red-700", azul = "bg-blue-100 text-blue-700";
  const min = (d?: string | Date | null) => { if (!d) return null; const t = new Date(d).getTime(); return isNaN(t) ? null : Math.round((Date.now() - t) / 60000); };
  // vídeo com letra (Order 1): espera a música principal ficar pronta
  if (v.producao === "aguardando_musica") return { chave: "sem_fotos", rotulo: "Aguardando a música", detalhe: "O vídeo com letra começa sozinho quando a música principal ficar pronta.", cor: cinza };
  if (v.producao === "aguardando_fotos") return { chave: "sem_fotos", rotulo: "Sem fotos", detalhe: "O cliente ainda não enviou as fotos. O link da página de fotos vai no e-mail “Sube tus fotos”.", cor: cinza };
  if (v.producao === "erro") return { chave: "erro", rotulo: "Erro de geração", detalhe: v.erro_msg ? `O render falhou: ${v.erro_msg}` : "O render falhou.", cor: vermelho };
  if (v.producao === "concluido") {
    if (v.entrega_email) return { chave: "entregue", rotulo: "Entregue", detalhe: "Vídeo pronto e e-mail enviado.", cor: verde };
    return { chave: "pendente_envio", rotulo: "Pendente envio", detalhe: "Vídeo pronto, mas o e-mail não saiu.", cor: amarelo };
  }
  const m = min(v.atualizado_em);
  if (m !== null && m > VIDEO_TRAVADO_MIN_ES) {
    return { chave: "erro", rotulo: "Erro de geração", detalhe: v.producao === "renderizando" ? `Travado em "renderizando" há ${m} min.` : `Na fila há ${m} min e o render nunca começou.`, cor: vermelho };
  }
  return { chave: "renderizando", rotulo: v.producao === "renderizando" ? "Renderizando" : "Aguardando render", detalhe: v.producao === "renderizando" ? "O vídeo está sendo feito agora." : "Fotos recebidas, esperando o render começar.", cor: azul };
}
