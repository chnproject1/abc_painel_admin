-- Upsell 2 "estilo extra" da operação ES (LATAM): o estilo escolhido no funil.
--
--   PedidoEs.estilo2  preenchido = o up2/ds2/ds3 deste pedido é o estilo extra
--                     (vazio = funil antigo, em que era o vídeo). A música sai
--                     nas colunas da música 2 pelo fluxo n8n "ES - Up Estilo".
--
-- Quem grava é /api/es/checkout, junto com a compra (create-upsell do funil).
--
-- Rodar ANTES do deploy do admin: o Prisma já lê a coluna nova.
-- Pode rodar de novo sem problema.

ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "estilo2" TEXT;
