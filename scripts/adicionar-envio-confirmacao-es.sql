-- Envio da confirmação do vídeo (operação ES / LATAM): o e-mail "Sube tus
-- fotos", com o link da página de fotos, que sai quando o cliente compra o
-- up2, ds2 ou ds3 (fluxo n8n "abcMusic - ES - Envio Confirmação Vídeo").
--
--   PedidoVideoEs.envio_confirmacao     o e-mail saiu
--   PedidoVideoEs.envio_confirmacao_em  quando
--   PedidoVideoEs.envio_confirmacao_tentativas  quantas vezes o admin pediu o
--                                        e-mail ao n8n (compra, botão e o
--                                        reenvio automático, que para em 3)
--
-- Quem marca é o próprio fluxo, no fim do envio, em /api/es/n8n:
--   { "action": "video_confirmacao_enviada", "id": "<pedido_id>" }
--
-- Rodar ANTES do deploy do admin: o Prisma já lê as colunas novas.
-- Pode rodar de novo sem problema.

ALTER TABLE "PedidoVideoEs" ADD COLUMN IF NOT EXISTS "envio_confirmacao"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PedidoVideoEs" ADD COLUMN IF NOT EXISTS "envio_confirmacao_em" TIMESTAMP(3);
ALTER TABLE "PedidoVideoEs" ADD COLUMN IF NOT EXISTS "envio_confirmacao_tentativas" INTEGER NOT NULL DEFAULT 0;

-- Pedidos que já existiam: quem abriu o link ou já mandou as fotos recebeu o
-- e-mail. O resto fica "não enviada" pra decidir se reenvia.
UPDATE "PedidoVideoEs"
   SET "envio_confirmacao" = true,
       "envio_confirmacao_em" = COALESCE("aberto_em", "fotos_em", "criado_em")
 WHERE "envio_confirmacao" = false
   AND ("aberto_em" IS NOT NULL OR "producao" <> 'aguardando_fotos');
