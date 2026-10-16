-- Operação ES: upsell de estilo extra + order bumps do vídeo cartoon.
-- Rodar no pgAdmin (Query Tool) ANTES do deploy do admin — o Prisma já lê as colunas novas.
-- Pode rodar de novo sem problema (IF NOT EXISTS).

-- Upsell 2 "estilo extra": o estilo escolhido no funil (preenchido = o up2/ds2/ds3 é o estilo)
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "estilo2" TEXT;

-- id da tarefa do Suno da música principal (vem no music_ready): com ele + song_id o vídeo
-- cartoon pega a letra com o tempo de cada palavra direto da API do Suno
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "suno_task_id" TEXT;

-- Order bumps do checkout (cobrados junto com a música, na mesma sessão da Stripe).
-- Cada bump guarda o PRODUTO marcado (vazio = não marcou) e o valor em US$.
--   bump1 = "video"     → vídeo cartoon da música principal (US$ 15)
--   bump2 = "lookalike" → avatar parecido com a pessoa, pelas fotos (+US$ 3)
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "bump1" TEXT;
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "bump1_valor" DECIMAL(10,2);
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "bump2" TEXT;
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "bump2_valor" DECIMAL(10,2);
