import { prisma } from "@/lib/prisma";
import { linkFotosEs, gerarToken } from "@/lib/video";
import { liberacoes, ESPERA_FOTOS_MIN } from "@/lib/es-ofertas";

/** Vídeo cartoon (order bump) mora na mesma tabela do vídeo de fotos, marcado em opcoes. */
export function ehCartoon(opcoes: unknown): boolean {
  return !!opcoes && typeof opcoes === "object" && (opcoes as any).modelo === "cartoon";
}

/*
  Avisa o n8n (fluxo `es-video-fotos-link`) que a venda acabou de liberar o
  vídeo, pra mandar na hora o e-mail "sube tus fotos" com o link.

  Por que existe: o funil leva a pessoa pra página de fotos, mas ela pode
  fechar antes, o navegador do app pode travar o redirecionamento, e o e-mail
  da música pode levar até 3 dias (plano basic). Sem este e-mail, o link das
  fotos ficava só na tela de obrigado.

  Chamada quando a linha de PedidoVideoEs nasce, pelo botão "Reenviar
  confirmação" e pelo reenvio automático (/api/es/video/confirmacoes).
  Quem já mandou as fotos não recebe: o link não serve mais pra nada.
  Nunca lança.
*/
export const CONFIRMACAO_MAX_TENTATIVAS = 3;

export async function avisarVideoLiberadoEs(pedidoId: string, token: string): Promise<string> {
  try {
    const v = await prisma.pedidoVideoEs.findUnique({ where: { pedido_id: pedidoId }, select: { producao: true, opcoes: true } });
    if (v && ehCartoon(v.opcoes) && !(v.opcoes as any).lookalike) return "cartoon_sem_fotos";
    if (v && v.producao !== "aguardando_fotos") return "ja_tem_fotos";

    const url = process.env.ES_N8N_FOTOS_WEBHOOK_URL;
    if (!url) {
      console.error("[video-es] ES_N8N_FOTOS_WEBHOOK_URL não configurada — e-mail das fotos não enviado:", pedidoId);
      return "sem_url";
    }
    const p = await prisma.pedidoEs.findUnique({ where: { id: pedidoId }, select: { nome: true, email: true, idioma: true } });
    if (!p?.email) return "sem_email";

    // Conta a tentativa antes de chamar: se o n8n travar, o reenvio
    // automático não fica tentando pra sempre
    await prisma.pedidoVideoEs.update({ where: { pedido_id: pedidoId }, data: { envio_confirmacao_tentativas: { increment: 1 } } }).catch(() => {});

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedido_id: pedidoId,
        nome: p.nome,                  // homenageado(a)
        email: p.email.split("?")[0],
        idioma: p.idioma || "es",
        video_link: linkFotosEs(token),
      }),
      signal: AbortSignal.timeout(6000),
    });
    console.log("[video-es] e-mail das fotos pedido ao n8n:", pedidoId, "|", r.status);
    return r.ok ? "avisado" : `n8n_${r.status}`;
  } catch (e: any) {
    console.error("[video-es] falha ao avisar o e-mail das fotos:", pedidoId, e?.message);
    return "erro";
  }
}

/*
  Dispara a produção do vídeo ES (fluxo n8n `es-video-producao`) quando os
  DOIS insumos existem: as fotos e a música.

  No BR o vídeo é pago depois das fotos e da música, então o pagamento é o
  gatilho. No ES o vídeo é pago no checkout, antes de tudo, e as duas coisas
  chegam em qualquer ordem — por isso esta função é chamada das duas pontas:
    - /api/es/video  (acao 'fotos')  → cliente acabou de mandar as fotos
    - /api/es/n8n    (music_ready)   → a música 1 ficou pronta
  Quem chegar por último dispara.

  Nunca lança: é chamada no meio de outra resposta (a página de fotos, o
  callback do n8n), e uma falha aqui não pode derrubar a gravação que já deu
  certo. O vídeo fica em 'fotos_enviadas' e o painel mostra como travado
  depois de VIDEO_TRAVADO_MIN — dá pra reenviar pelo botão.
*/
export async function dispararProducaoVideoEs(pedidoId: string): Promise<string> {
  try {
    const v = await prisma.pedidoVideoEs.findUnique({
      where: { pedido_id: pedidoId },
      select: { producao: true, fotos: true, opcoes: true, pedido: { select: { link_audio: true } } },
    });
    if (!v) return "sem_video";
    if (ehCartoon(v.opcoes)) return dispararCartoonEs(pedidoId);   // nunca no render de fotos
    if (v.producao !== "fotos_enviadas") return `producao=${v.producao}`;
    if (!Array.isArray(v.fotos) || v.fotos.length === 0) return "sem_fotos";
    if (!v.pedido.link_audio) return "sem_musica";   // a música dispara quando ficar pronta

    // Mesma variável do botão "Refazer" do painel (/api/es/trigger)
    const url = process.env.ES_N8N_VIDEO_WEBHOOK_URL || process.env.US_N8N_VIDEO_WEBHOOK_URL;
    if (!url) {
      console.error("[video-es] ES_N8N_VIDEO_WEBHOOK_URL não configurada — produção não disparada:", pedidoId);
      return "sem_url";
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido_id: pedidoId, payment_id: pedidoId, tipo: "video" }),
      signal: AbortSignal.timeout(8000),
    });
    console.log("[video-es] produção disparada:", pedidoId, "| n8n", r.status);
    return r.ok ? "disparado" : `n8n_${r.status}`;
  } catch (e: any) {
    console.error("[video-es] falha ao disparar a produção:", pedidoId, e?.message);
    return "erro";
  }
}

/*
  Música REGENERADA (o music_ready chegou com um link_audio diferente do que
  já estava gravado): o vídeo que já existia foi feito com o MP3 antigo.
  Volta pra fila e renderiza de novo com as MESMAS fotos — o cliente recebe o
  e-mail do vídeo de novo, no mesmo link (/video-es/?t=). Sem cobrar. Mesmo
  papel do `video_regerar` do BR, só que automático.

  Sem fotos ainda: não há vídeo pra refazer; ele sai com a música nova quando
  as fotos chegarem.
*/
export async function refazerVideoEs(pedidoId: string): Promise<string> {
  try {
    const v = await prisma.pedidoVideoEs.findUnique({ where: { pedido_id: pedidoId }, select: { producao: true, fotos: true, opcoes: true } });
    if (!v) return "sem_video";
    if (ehCartoon(v.opcoes)) return dispararCartoonEs(pedidoId, true);   // música nova → vídeo cartoon de novo
    if (!Array.isArray(v.fotos) || v.fotos.length === 0) return "sem_fotos";
    await prisma.pedidoVideoEs.update({
      where: { pedido_id: pedidoId },
      data: { producao: "fotos_enviadas", entrega_email: false, erro_msg: null, concluido_em: null },
    });
    return dispararProducaoVideoEs(pedidoId);
  } catch (e: any) {
    console.error("[video-es] falha ao refazer o vídeo:", pedidoId, e?.message);
    return "erro";
  }
}

/*
  Envio da Página Premium (up1, ds1 ou ds3) — fluxo n8n da página.

  A página só existe depois da música (o link_pagina vem no music_ready), e
  a compra da página pode acontecer antes ou depois disso: no plano silver a
  música às vezes fica pronta enquanto a pessoa ainda está nos upsells. Por
  isso, igual ao vídeo, quem chega por último dispara:
    - /api/es/n8n music_ready → a página já tinha sido comprada
    - /api/es/checkout        → a compra da página acabou de entrar e a música já existe
  Na regeneração (link novo), `reenviar` manda de novo mesmo já entregue: o
  link antigo continua tocando a música antiga.

  Antes era um HTTP dentro do fluxo da música, que não sabia se a página ia
  ser comprada depois. Tirar esse HTTP do n8n, senão sai e-mail em dobro.
*/
export async function dispararPaginaEs(pedidoId: string, reenviar = false): Promise<string> {
  try {
    const p = await prisma.pedidoEs.findUnique({
      where: { id: pedidoId },
      select: { up1_status: true, up2_status: true, ds_status: true, link_pagina: true, pagina_entrega_email: true },
    });
    if (!p) return "sem_pedido";
    const comprou = p.up1_status === "pago" || (p.ds_status === "pago" && p.up1_status !== "pago");
    if (!comprou) return "nao_comprou";
    if (!p.link_pagina) return "sem_pagina";           // a música ainda não ficou pronta
    if (p.pagina_entrega_email && !reenviar) return "ja_entregue";

    const url = process.env.ES_N8N_PAGINA_WEBHOOK_URL;
    if (!url) {
      console.error("[pagina-es] ES_N8N_PAGINA_WEBHOOK_URL não configurada — página não enviada:", pedidoId);
      return "sem_url";
    }
    if (reenviar) await prisma.pedidoEs.update({ where: { id: pedidoId }, data: { pagina_entrega_email: false } });

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido_id: pedidoId, payment_id: pedidoId, tipo: "pagina", link_pagina: p.link_pagina, reenvio: reenviar }),
      signal: AbortSignal.timeout(8000),
    });
    console.log("[pagina-es] envio da página disparado:", pedidoId, reenviar ? "(reenvio)" : "", "| n8n", r.status);
    return r.ok ? "disparado" : `n8n_${r.status}`;
  } catch (e: any) {
    console.error("[pagina-es] falha ao disparar a página:", pedidoId, e?.message);
    return "erro";
  }
}

/*
  Música do estilo extra (up2, ds2 ou ds3 com `estilo2`) — fluxo n8n
  "ES - Up Estilo" (ES_N8N_ESTILO_WEBHOOK_URL). Mesma letra, outro estilo.

  Sai depois da música principal, como a página: quem chega por último dispara.
    - /api/es/n8n music_ready → o estilo já tinha sido comprado
    - /api/es/checkout        → a compra do estilo entrou e a música já existe
  O fluxo gera no Suno, chama up_music_ready e manda o e-mail com o link
  (up_email_entregue / up_email_erro). `forcar` (botão do painel, reprocesso)
  gera de novo mesmo já gerada. Nunca lança.
*/
export async function dispararEstiloEs(pedidoId: string, forcar = false): Promise<string> {
  try {
    const p = await prisma.pedidoEs.findUnique({
      where: { id: pedidoId },
      select: {
        nome: true, email: true, idioma: true, letra: true, estilo: true, estilo2: true,
        up2_status: true, ds_status: true, link_audio: true,
        up_gerou_musica: true, up_entrega_email: true,
      },
    });
    if (!p) return "sem_pedido";
    const comprou = p.up2_status === "pago" || (p.ds_status === "pago" && p.up2_status !== "pago");
    if (!comprou || !p.estilo2) return "nao_comprou";
    if (!p.link_audio) return "sem_musica";             // sai depois da música principal
    if ((p.up_gerou_musica || p.up_entrega_email) && !forcar) return "ja_gerada";

    const url = process.env.ES_N8N_ESTILO_WEBHOOK_URL;
    if (!url) {
      console.error("[estilo-es] ES_N8N_ESTILO_WEBHOOK_URL não configurada — estilo não gerado:", pedidoId);
      return "sem_url";
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedido_id: pedidoId, payment_id: pedidoId, tipo: "estilo",
        nome: p.nome,                  // homenageado(a)
        email: p.email.split("?")[0],
        idioma: p.idioma || "es",
        letra: p.letra,
        estilo: p.estilo,              // o da música principal
        estilo2: p.estilo2,            // o escolhido no upsell
      }),
      signal: AbortSignal.timeout(8000),
    });
    console.log("[estilo-es] geração do estilo disparada:", pedidoId, p.estilo2, "| n8n", r.status);
    return r.ok ? "disparado" : `n8n_${r.status}`;
  } catch (e: any) {
    console.error("[estilo-es] falha ao disparar o estilo:", pedidoId, e?.message);
    return "erro";
  }
}

/*
  VÍDEO CARTOON (order bump do checkout) — fluxo n8n "ES - Vídeo Cartoon"
  (ES_N8N_VIDEO_CARTOON_WEBHOOK_URL). SÓ a música principal vira vídeo: quem
  dispara é o music_ready, nunca o up_music_ready da música do estilo extra.

  Estados (PedidoVideoEs.producao):
    aguardando_musica  sem lookalike, esperando a música principal
    aguardando_fotos   lookalike, esperando as fotos (até ESPERA_FOTOS_MIN; depois avatar aleatório)
    fotos_enviadas     lookalike com fotos, esperando a música
    renderizando → concluido | erro   (o n8n e o cartoon-render marcam)
*/

/** Cria a linha do vídeo cartoon quando o pedido pago tem o bump. Idempotente. */
export async function garantirVideoCartoonEs(pedidoId: string): Promise<string> {
  try {
    const p = await prisma.pedidoEs.findUnique({ where: { id: pedidoId }, select: { status: true, bump1: true, bump2: true, video: { select: { pedido_id: true } } } });
    if (!p) return "sem_pedido";
    const lib = liberacoes(p);
    if (!lib.video_cartoon) return "sem_bump";
    if (p.video) return "ja_existe";
    const v = await prisma.pedidoVideoEs.create({
      data: {
        pedido_id: pedidoId, token: gerarToken(),
        opcoes: { modelo: "cartoon", lookalike: lib.lookalike },
        producao: lib.lookalike ? "aguardando_fotos" : "aguardando_musica",
      },
      select: { token: true },
    });
    // lookalike: e-mail "sube tus fotos" com o link da página de fotos, na hora
    if (lib.lookalike) await avisarVideoLiberadoEs(pedidoId, v.token);
    // a música pode já estar pronta (silver): tenta disparar agora
    await dispararCartoonEs(pedidoId);
    return "criado";
  } catch (e: any) {
    console.error("[cartoon-es] falha ao criar o vídeo:", pedidoId, e?.message);
    return "erro";
  }
}

/**
 * Dispara o vídeo cartoon quando dá: pedido pago, música principal pronta e, no
 * lookalike, fotos recebidas ou prazo de ESPERA_FOTOS_MIN vencido. `forcar` (refazer,
 * música regenerada, reprocesso de erro) ignora o estado atual. Nunca lança.
 */
export async function dispararCartoonEs(pedidoId: string, forcar = false): Promise<string> {
  try {
    const v = await prisma.pedidoVideoEs.findUnique({
      where: { pedido_id: pedidoId },
      select: { producao: true, fotos: true, opcoes: true, criado_em: true, pedido: { select: { status: true, link_audio: true } } },
    });
    if (!v || !ehCartoon(v.opcoes)) return "nao_cartoon";
    if (v.pedido.status !== "pago") return "nao_pago";
    if (!v.pedido.link_audio) return "sem_musica";   // o music_ready dispara depois
    const lookalike = !!(v.opcoes as any).lookalike;
    const temFotos = Array.isArray(v.fotos) && v.fotos.length > 0;
    const venceu = Date.now() - v.criado_em.getTime() > ESPERA_FOTOS_MIN * 60000;
    if (lookalike && !temFotos && !venceu && !forcar) return "aguardando_fotos";
    if (!forcar && !["aguardando_musica", "aguardando_fotos", "fotos_enviadas"].includes(v.producao)) return `producao=${v.producao}`;

    const url = process.env.ES_N8N_VIDEO_CARTOON_WEBHOOK_URL;
    if (!url) {
      console.error("[cartoon-es] ES_N8N_VIDEO_CARTOON_WEBHOOK_URL não configurada — vídeo não disparado:", pedidoId);
      return "sem_url";
    }
    // marca antes de chamar: music_ready e fotos chegando juntos não disparam duas vezes
    await prisma.pedidoVideoEs.update({
      where: { pedido_id: pedidoId },
      data: { producao: "renderizando", erro_msg: null, entrega_email: false, concluido_em: null },
    });
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido_id: pedidoId, payment_id: pedidoId, tipo: "video_cartoon" }),
      signal: AbortSignal.timeout(8000),
    });
    console.log("[cartoon-es] vídeo disparado:", pedidoId, lookalike ? (temFotos ? "(com fotos)" : "(sem fotos: avatar aleatório)") : "", "| n8n", r.status);
    if (!r.ok) await prisma.pedidoVideoEs.update({ where: { pedido_id: pedidoId }, data: { producao: "erro", erro_msg: `n8n recusou o disparo (${r.status})` } });
    return r.ok ? "disparado" : `n8n_${r.status}`;
  } catch (e: any) {
    console.error("[cartoon-es] falha ao disparar:", pedidoId, e?.message);
    await prisma.pedidoVideoEs.update({ where: { pedido_id: pedidoId }, data: { producao: "erro", erro_msg: `disparo: ${e?.message}` } }).catch(() => {});
    return "erro";
  }
}
