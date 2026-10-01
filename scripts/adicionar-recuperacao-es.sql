-- Recuperação de pedidos ES (LATAM): quando o e-mail de recuperação saiu.
--
--   PedidoEs.recuperacao_em      data do envio (o contador `recuperacao` já existia)
--   PedidoEs.recuperacao_motivo  o que travou a compra (tela do link)
--   PedidoEs.recuperacao_entrega resultado do e-mail: entregue | erro: <motivo>
--
-- Quem grava é /api/es/recuperacao (Power Automate "abcMusic - ES - Recuperação").
-- O pedido original vira status 'recuperado' quando o pedido de recuperação
-- (recovery_id = id do original) é pago.
--
-- Rodar ANTES do deploy do admin: o Prisma já lê a coluna nova.
-- Pode rodar de novo sem problema.

ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "recuperacao_em" TIMESTAMP(3);

-- Funil de recuperação: o motivo escolhido na tela "¿Qué te detuvo?"
-- (precio | letra | estilo | dudas | pago | momento | direto) — só botões.
-- Gravado no pedido ORIGINAL pela função recuperar-pedido do site.
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "recuperacao_motivo" TEXT;
-- Coluna de texto livre de uma versão anterior: não é usada. Se o SQL antigo
-- já tinha rodado, isto apaga; se não, não faz nada.
ALTER TABLE "PedidoEs" DROP COLUMN IF EXISTS "recuperacao_texto";

-- Resultado do e-mail de recuperação: 'entregue' | 'erro: <motivo>'.
-- Marcado pelo fluxo n8n "ES - Recuperação" em /api/es/n8n
-- (actions recuperacao_entregue / recuperacao_erro).
ALTER TABLE "PedidoEs" ADD COLUMN IF NOT EXISTS "recuperacao_entrega" TEXT;
