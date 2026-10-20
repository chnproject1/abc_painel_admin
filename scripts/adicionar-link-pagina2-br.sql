-- Estilo extra do BR: guarda a página da 2ª música, para o "Reenviar" do painel
-- mandar o mesmo link sem gerar a música de novo.
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "link_pagina2" TEXT;
