-- Rastreio da operação ES (LATAM), POR OFERTA: marca se cada venda já foi
-- registrada na UTMify / Meta / TikTok. Cada oferta é um pedido próprio na
-- UTMify (<id>, <id>_up1, <id>_up2, <id>_ds1…), então cada uma tem o seu campo.
--
--   PedidoEs.rastreado       frente (silver | basic)
--   PedidoEs.up1_rastreado   up1 (página)
--   PedidoEs.up2_rastreado   up2 (vídeo)
--   PedidoEs.ds_rastreado    downsell (ds1, ds2 ou ds3)
--   PedidoVideoEs.rastreado  espelho da venda que liberou o vídeo (up2 ou ds) —
--                            mantido pro card "Vídeo: sem rastreio"
--
-- Quem marca é o fluxo de rastreio, em /api/es/n8n:
--   { "action": "rastreado", "id": "<pedido_id>", "oferta": "up1" }
--   (oferta = front | up1 | up2 | ds1 | ds2 | ds3; sem oferta = front)
--
-- Rodar ANTES do deploy do admin: o Prisma já lê as colunas novas.
-- Só acrescenta coluna com padrão false. Pode rodar de novo sem problema.

ALTER TABLE "PedidoEs"      ADD COLUMN IF NOT EXISTS "rastreado"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PedidoEs"      ADD COLUMN IF NOT EXISTS "up1_rastreado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PedidoEs"      ADD COLUMN IF NOT EXISTS "up2_rastreado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PedidoEs"      ADD COLUMN IF NOT EXISTS "ds_rastreado"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PedidoVideoEs" ADD COLUMN IF NOT EXISTS "rastreado"     BOOLEAN NOT NULL DEFAULT false;
