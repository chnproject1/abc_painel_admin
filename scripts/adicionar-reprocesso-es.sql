-- Reprocessamento automático da operação ES (LATAM): quantas vezes cada etapa
-- de um pedido já foi disparada de novo por /api/es/reprocessar (fluxo do
-- Power Automate "abcMusic - ES - Reprocessa Geração e Envio", a cada 10 min).
--
--   PedidoEs.reprocesso_musica  geração da música 1 (limite 2 — gasta Suno)
--   PedidoEs.reprocesso_envio   e-mail da música (limite 3)
--   PedidoEs.reprocesso_pagina  e-mail da Página Premium (limite 3)
--   PedidoEs.reprocesso_video   render do vídeo (limite 3)
--   PedidoEs.reprocesso_em      último reprocesso, de qualquer etapa
--
-- Rodar ANTES do deploy do admin: o Prisma já lê as colunas novas.
-- Só acrescenta coluna. Pode rodar de novo sem problema.

ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "reprocesso_musica" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "reprocesso_envio"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "reprocesso_pagina" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "reprocesso_video"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "reprocesso_em"     TIMESTAMP(3);
