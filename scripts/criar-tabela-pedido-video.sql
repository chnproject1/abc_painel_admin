-- Tabela do upsell de vídeo (model PedidoVideo em prisma/schema.prisma).
-- Gerado com `prisma migrate diff` a partir do banco atual, pra criação
-- manual. Depois de rodar, `npx prisma generate` atualiza o client.
--
-- Única diferença em relação ao que o `db push` faria: atualizado_em ganha
-- DEFAULT CURRENT_TIMESTAMP, pra um INSERT feito à mão no psql não falhar.
-- O Prisma continua preenchendo o campo sozinho em cada create/update.

CREATE TABLE "PedidoVideo" (
    "pedido_id"        TEXT NOT NULL,                              -- pix_char da música (= Pedido.id)
    "token"            TEXT NOT NULL,                              -- aleatório, vai no link /upvideo/?t=
    "status"           TEXT NOT NULL DEFAULT 'pendente',           -- venda: pendente | pago
    "producao"         TEXT NOT NULL DEFAULT 'aguardando_fotos',   -- aguardando_fotos | fotos_enviadas | renderizando | concluido | erro
    "fotos"            JSONB NOT NULL DEFAULT '[]',                -- [{path, w, h, ordem}]
    "opcoes"           JSONB NOT NULL DEFAULT '{}',                -- {card_nome: true}
    "musica_seg"       DECIMAL(8,2),
    "video_path"       TEXT,                                       -- videos/<token>/final.mp4
    "whatsapp_path"    TEXT,                                       -- videos/<token>/whatsapp.mp4
    "pagamento_id"     TEXT,                                       -- pix_char do PIX do vídeo
    "valor"            DECIMAL(10,2),
    "entrega_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "erro_msg"         TEXT,
    "tentativas"       INTEGER NOT NULL DEFAULT 0,
    "utm_source"       TEXT,
    "utm_medium"       TEXT,
    "utm_campaign"     TEXT,
    "utm_content"      TEXT,
    "utm_term"         TEXT,
    "enviado_em"       TIMESTAMP(3),
    "aberto_em"        TIMESTAMP(3),
    "fotos_em"         TIMESTAMP(3),
    "pago_em"          TIMESTAMP(3),
    "concluido_em"     TIMESTAMP(3),
    "criado_em"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoVideo_pkey" PRIMARY KEY ("pedido_id")
);

CREATE UNIQUE INDEX "PedidoVideo_token_key"        ON "PedidoVideo"("token");
CREATE UNIQUE INDEX "PedidoVideo_pagamento_id_key" ON "PedidoVideo"("pagamento_id");
CREATE INDEX        "PedidoVideo_status_idx"       ON "PedidoVideo"("status");
CREATE INDEX        "PedidoVideo_producao_idx"     ON "PedidoVideo"("producao");
CREATE INDEX        "PedidoVideo_criado_em_idx"    ON "PedidoVideo"("criado_em");

ALTER TABLE "PedidoVideo"
    ADD CONSTRAINT "PedidoVideo_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "Pedido"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Conferir:
-- \d "PedidoVideo"

-- Se a tabela JÁ foi criada com a versão anterior (status único), rodar só isto:
-- ALTER TABLE "PedidoVideo" ADD COLUMN "producao" TEXT NOT NULL DEFAULT 'aguardando_fotos';
-- ALTER TABLE "PedidoVideo" ALTER COLUMN "status" SET DEFAULT 'pendente';
-- UPDATE "PedidoVideo" SET producao = status, status = 'pendente';
-- CREATE INDEX "PedidoVideo_producao_idx" ON "PedidoVideo"("producao");
