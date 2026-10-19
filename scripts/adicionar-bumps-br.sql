-- Order bumps do BR (QUIZ BR V2): vídeo com letra, estilo extra e Página Premium.
-- Todas opcionais: pedido sem bump não muda nada.
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "bumps" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "estilo2" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "suno_task_id" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "song_id2" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "link_audio2" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "bumps_enviados" TEXT;
