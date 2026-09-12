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

export type VideoResumo = {
  status: string;
  producao: string;
  entrega_whatsapp: boolean;
  erro_msg?: string | null;
  atualizado_em?: string | Date | null;
  pago_em?: string | Date | null;
  concluido_em?: string | Date | null;
  fotos_em?: string | Date | null;
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

  if (v.producao === "renderizando") {
    const min = minutosDesde(v.atualizado_em);
    if (min !== null && min > VIDEO_TRAVADO_MIN) {
      return { chave: "erro", rotulo: "Erro de geração", detalhe: `Travado em "renderizando" há ${min} min. O container parou no meio; dispare o vídeo de novo no n8n.`, cor: vermelho };
    }
    return { chave: "renderizando", rotulo: "Renderizando", detalhe: "O vídeo está sendo feito agora. Leva alguns minutos.", cor: azul };
  }

  // pago mas a produção ainda não começou (fotos_enviadas / aguardando_fotos)
  const min = minutosDesde(v.pago_em);
  if (min !== null && min > VIDEO_TRAVADO_MIN) {
    return { chave: "erro", rotulo: "Erro de geração", detalhe: `Pago há ${min} min e o render nunca começou. O n8n não recebeu o pagamento; dispare o vídeo de novo.`, cor: vermelho };
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
