import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarToken, linkVideo, sufixoLink, urlPublica } from "@/lib/video";

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (secret) {
    const token = req.headers.get("x-callback-secret") ?? req.nextUrl.searchParams.get("secret");
    if (token !== secret) {
      return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
    }
  }

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const { action, id } = data;
  if (!action) return NextResponse.json({ success: false, error: "action obrigatório" }, { status: 400 });
  if (!id && action !== "video_vencidos") return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });

  try {
    if (action === "music_ready") {
      await prisma.pedido.update({
        where: { id },
        data: {
          gerou_musica: true,
          erro_geracao: false,
          link_pagina:  data.link_pagina  || undefined,
          link_basica:  data.link_basica  || undefined,
          link_audio:   data.link_audio   || undefined,
          link_mp4:     data.link_mp4     || undefined,
          song_id:      data.song_id      || undefined,
          data_entrega: data.data_entrega ? new Date(data.data_entrega) : undefined,
          status:       "pago",
        },
      });
      return NextResponse.json({ success: true, message: "Música marcada como gerada" });
    }

    if (action === "whats_entregue") {
      await prisma.pedido.update({ where: { id }, data: { entrega_whatsapp: true } });
      return NextResponse.json({ success: true, message: "WhatsApp marcado como entregue" });
    }

    if (action === "whats_erro") {
      await prisma.pedido.update({ where: { id }, data: { entrega_whatsapp: false } });
      return NextResponse.json({ success: true, message: "WhatsApp marcado como erro" });
    }

    if (action === "email_entregue") {
      await prisma.pedido.update({ where: { id }, data: { entrega_email: true } });
      return NextResponse.json({ success: true, message: "Email marcado como entregue" });
    }

    if (action === "email_erro") {
      await prisma.pedido.update({ where: { id }, data: { entrega_email: false } });
      return NextResponse.json({ success: true, message: "Email marcado como erro" });
    }

    if (action === "erro_geracao") {
      await prisma.pedido.update({ where: { id }, data: { gerou_musica: false, erro_geracao: true } });
      return NextResponse.json({ success: true, message: "Erro de geração registrado" });
    }

    /* ─── Upsell de vídeo ──────────────────────────────────────────────
       `id` continua sendo o pix_char da MÚSICA (= PedidoVideo.pedido_id).
       O n8n chama estas actions em três momentos: ao montar a mensagem da
       música (video_criar), durante o render (renderizando/concluido/erro)
       e na entrega (whats_entregue). Venda (status) e produção (producao)
       são colunas separadas — ver lib/video.ts. */

    // Cria a linha e devolve o link. Idempotente: se já existe, devolve o
    // mesmo token, com ja_existia: true, pra reprocessar não gerar dois links.
    if (action === "video_criar") {
      const pedido = await prisma.pedido.findUnique({ where: { id }, select: { id: true } });
      if (!pedido) return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });

      let video = await prisma.pedidoVideo.findUnique({ where: { pedido_id: id } });
      const ja_existia = Boolean(video);
      if (!video) {
        video = await prisma.pedidoVideo.create({
          data: { pedido_id: id, token: gerarToken(), enviado_em: new Date() },
        });
      }
      const link = linkVideo(video.token);
      return NextResponse.json({
        success: true,
        ja_existia,
        token: video.token,
        link,
        // O botão do template do WhatsApp tem o prefixo fixo do site e recebe só
        // o que vem depois: "upvideo/?t=<token>". Pronto pra colar na variável.
        sufixo: sufixoLink(link),
        status: video.status,
        producao: video.producao,
      });
    }

    // Tudo que o fluxo de produção precisa numa chamada só: fotos com URL
    // pública, música, nome, telefone e onde o vídeo está (ou vai ficar).
    if (action === "video_dados") {
      const video = await prisma.pedidoVideo.findUnique({
        where: { pedido_id: id },
        include: { pedido: { select: { nome: true, telefone: true, email: true, link_audio: true, estilo: true } } },
      });
      if (!video) return NextResponse.json({ success: false, error: "Vídeo não encontrado" }, { status: 404 });
      const fotos = Array.isArray(video.fotos) ? (video.fotos as any[]) : [];
      const link = linkVideo(video.token);
      return NextResponse.json({
        success: true,
        id: video.pedido_id,
        token: video.token,
        link,
        sufixo: sufixoLink(link),
        status: video.status,
        producao: video.producao,
        nome: video.pedido.nome,
        telefone: video.pedido.telefone,
        email: video.pedido.email,
        estilo: video.pedido.estilo,
        musica_url: video.pedido.link_audio,
        musica_seg: video.musica_seg != null ? Number(video.musica_seg) : null,
        fotos: fotos.map(f => ({ url: urlPublica(f.path), path: f.path, w: f.w, h: f.h, ordem: f.ordem })),
        opcoes: video.opcoes,
        video_url: urlPublica(video.video_path),
        whatsapp_url: urlPublica(video.whatsapp_path),
        entrega_whatsapp: video.entrega_whatsapp,
        erro_msg: video.erro_msg,
        tentativas: video.tentativas,
      });
    }

    if (action === "video_renderizando") {
      await prisma.pedidoVideo.update({
        where: { pedido_id: id },
        data: { producao: "renderizando", erro_msg: null },
      });
      return NextResponse.json({ success: true, message: "Vídeo em renderização" });
    }

    if (action === "video_concluido") {
      await prisma.pedidoVideo.update({
        where: { pedido_id: id },
        data: {
          producao:      "concluido",
          concluido_em:  new Date(),
          erro_msg:      null,
          video_path:    data.video_path    || undefined,
          whatsapp_path: data.whatsapp_path || undefined,
          musica_seg:    data.musica_seg != null && !isNaN(Number(data.musica_seg)) ? Number(data.musica_seg) : undefined,
        },
      });
      return NextResponse.json({ success: true, message: "Vídeo concluído" });
    }

    if (action === "video_erro") {
      await prisma.pedidoVideo.update({
        where: { pedido_id: id },
        data: {
          producao:   "erro",
          erro_msg:   String(data.erro_msg || "erro sem mensagem").slice(0, 1000),
          tentativas: { increment: 1 },
        },
      });
      return NextResponse.json({ success: true, message: "Erro do vídeo registrado" });
    }

    if (action === "video_whats_entregue") {
      await prisma.pedidoVideo.update({ where: { pedido_id: id }, data: { entrega_whatsapp: true } });
      return NextResponse.json({ success: true, message: "Vídeo marcado como entregue no WhatsApp" });
    }

    // Venda do vídeo registrada na UTMify/Meta/TikTok pelo fluxo track_upsell
    // (Power Automate). O `id` aqui é o PIX do VÍDEO (pagamento_id), que é o
    // que o fluxo recebe; o conector Postgres do PA não lê PedidoVideo (jsonb).
    if (action === "video_rastreado") {
      const video = await prisma.pedidoVideo.findUnique({ where: { pagamento_id: id }, select: { pedido_id: true, rastreado: true } });
      if (!video) return NextResponse.json({ success: false, error: "Vídeo não encontrado para esse PIX" }, { status: 404 });
      if (video.rastreado) return NextResponse.json({ success: true, ja_estava: true, message: "Já estava marcado como rastreado" });
      await prisma.pedidoVideo.update({ where: { pedido_id: video.pedido_id }, data: { rastreado: true } });
      return NextResponse.json({ success: true, ja_estava: false, message: "Venda do vídeo marcada como rastreada" });
    }

    // Música regenerada depois do vídeo comprado: a trilha mudou, então o
    // vídeo é feito de novo sem cobrar. Só volta a produção; a venda fica.
    if (action === "video_regerar") {
      const video = await prisma.pedidoVideo.findUnique({ where: { pedido_id: id }, select: { status: true } });
      if (!video) return NextResponse.json({ success: false, error: "Vídeo não encontrado" }, { status: 404 });
      if (video.status !== "pago") {
        return NextResponse.json({ success: true, skipped: "nao_pago", message: "Vídeo não comprado, nada a regerar" });
      }
      await prisma.pedidoVideo.update({
        where: { pedido_id: id },
        data: { producao: "fotos_enviadas", entrega_whatsapp: false, erro_msg: null, concluido_em: null },
      });
      return NextResponse.json({ success: true, message: "Vídeo voltou pra fila de render" });
    }

    /* ─── Limpeza de arquivos (fluxo agendado do n8n) ──────────────────
       O portal só responde o que venceu e anota o que foi apagado. Quem
       apaga no Supabase é o n8n. Regras:
         - vídeo (final + whatsapp) de pedido pago: VIDEO_RETENCAO_DIAS (90)
           depois de concluído. As fotos dele vão junto, porque uma
           regeneração de música precisaria delas.
         - fotos de quem NÃO comprou: FOTOS_RETENCAO_DIAS (30) depois do
           envio. A linha volta pra aguardando_fotos, e se a pessoa abrir o
           link de novo, escolhe as fotos outra vez. */
    if (action === "video_vencidos") {
      const diasVideo = Number(process.env.VIDEO_RETENCAO_DIAS || 90);
      const diasFotos = Number(process.env.FOTOS_RETENCAO_DIAS || 30);
      const limiteVideo = new Date(Date.now() - diasVideo * 86400000);
      const limiteFotos = new Date(Date.now() - diasFotos * 86400000);
      const limite = Math.min(200, Math.max(1, Number(data.limite) || 50));

      const videos = await prisma.pedidoVideo.findMany({
        where: { status: "pago", producao: "concluido", concluido_em: { lt: limiteVideo }, video_path: { not: null } },
        orderBy: { concluido_em: "asc" }, take: limite,
        select: { pedido_id: true, token: true, video_path: true, whatsapp_path: true, fotos: true, concluido_em: true },
      });
      const fotos = await prisma.pedidoVideo.findMany({
        where: { status: "pendente", fotos_em: { lt: limiteFotos }, NOT: { fotos: { equals: [] } } },
        orderBy: { fotos_em: "asc" }, take: limite,
        select: { pedido_id: true, token: true, fotos: true, fotos_em: true },
      });
      // Paths agrupados por bucket e SEM o prefixo do bucket, prontos pro
      // DELETE /storage/v1/object/<bucket> do Supabase: { prefixes: [...] }
      const semBucket = (p: string | null | undefined) => (p || "").replace(/^(fotos|videos)\//, "");
      const paths = (f: unknown) => (Array.isArray(f) ? f.map((x: any) => semBucket(x?.path)).filter(Boolean) : []);
      return NextResponse.json({
        success: true,
        dias: { video: diasVideo, fotos: diasFotos },
        videos: videos.map(v => ({
          id: v.pedido_id, token: v.token, concluido_em: v.concluido_em,
          apagar: { videos: [v.video_path, v.whatsapp_path].map(semBucket).filter(Boolean), fotos: paths(v.fotos) },
        })),
        fotos: fotos.map(v => ({ id: v.pedido_id, token: v.token, fotos_em: v.fotos_em, apagar: { fotos: paths(v.fotos) } })),
      });
    }

    // Depois de apagar no Supabase: { id, tipo: 'video' | 'fotos' }
    if (action === "video_apagado") {
      const tipo = data.tipo === "fotos" ? "fotos" : "video";
      const video = await prisma.pedidoVideo.findUnique({ where: { pedido_id: id }, select: { status: true } });
      if (!video) return NextResponse.json({ success: false, error: "Vídeo não encontrado" }, { status: 404 });
      if (tipo === "video") {
        await prisma.pedidoVideo.update({
          where: { pedido_id: id },
          data: { video_path: null, whatsapp_path: null, fotos: [] },
        });
        return NextResponse.json({ success: true, message: "Vídeo e fotos marcados como apagados" });
      }
      await prisma.pedidoVideo.update({
        where: { pedido_id: id },
        data: { fotos: [], ...(video.status === "pendente" ? { producao: "aguardando_fotos" } : {}) },
      });
      return NextResponse.json({ success: true, message: "Fotos marcadas como apagadas" });
    }

    return NextResponse.json({ success: false, error: `action desconhecida: ${action}` }, { status: 400 });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });
    }
    console.error("[n8n callback]", e);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
