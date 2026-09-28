-- Upsell 2 da operação ES (LATAM): vídeo com as fotos do cliente + música 1.
-- Rodar no pgAdmin ANTES do deploy do admin que traz o vídeo ES.
-- A venda (up2_status / ds_status / valores) fica em "PedidoEs"; aqui só a produção.

CREATE TABLE IF NOT EXISTS "PedidoVideoEs" (
    "pedido_id"     TEXT PRIMARY KEY REFERENCES "PedidoEs"("id"),
    "token"         TEXT NOT NULL UNIQUE,                          -- vai em /fotos-es/?t= e /video-es/?t=
    "producao"      TEXT NOT NULL DEFAULT 'aguardando_fotos',      -- aguardando_fotos | fotos_enviadas | renderizando | concluido | erro
    "fotos"         JSONB NOT NULL DEFAULT '[]',                   -- [{path, w, h, ordem}]
    "opcoes"        JSONB NOT NULL DEFAULT '{}',
    "musica_seg"    DECIMAL(8, 2),
    "video_path"    TEXT,                                          -- videos/<token>/final.mp4
    "entrega_email" BOOLEAN NOT NULL DEFAULT false,
    "erro_msg"      TEXT,
    "tentativas"    INTEGER NOT NULL DEFAULT 0,
    "aberto_em"     TIMESTAMP(3),
    "fotos_em"      TIMESTAMP(3),
    "concluido_em"  TIMESTAMP(3),
    "entregue_em"   TIMESTAMP(3),
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PedidoVideoEs_producao_idx"  ON "PedidoVideoEs"("producao");
CREATE INDEX IF NOT EXISTS "PedidoVideoEs_criado_em_idx" ON "PedidoVideoEs"("criado_em");
