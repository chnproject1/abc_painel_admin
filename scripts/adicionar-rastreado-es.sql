-- Rastreio da operação ES (LATAM): marca se a venda já foi registrada na
-- UTMify / Meta / TikTok, igual ao `rastreado` do BR.
--
--   PedidoEs.rastreado       venda da frente (silver | basic)
--   PedidoVideoEs.rastreado  venda que liberou o vídeo (up2, ds2 ou ds3)
--
-- Quem marca é o n8n, em /api/es/n8n:
--   { "action": "rastreado",       "id": "<pedido_id>" }
--   { "action": "video_rastreado", "id": "<pedido_id>" }
--
-- Rodar ANTES do deploy do admin: o Prisma já lê as colunas novas.
-- Só acrescenta coluna com padrão false — não mexe em nada que existe.

ALTER TABLE "PedidoEs"      ADD COLUMN IF NOT EXISTS "rastreado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PedidoVideoEs" ADD COLUMN IF NOT EXISTS "rastreado" BOOLEAN NOT NULL DEFAULT false;
