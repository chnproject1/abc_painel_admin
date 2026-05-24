/**
 * Simula o fluxo completo:
 * 1. Novo checkout (POST /api/checkout)
 * 2. Pagamento confirmado (POST /api/checkout action:update)
 * 3. Consulta dados (GET /api/checkout?id=xxx)
 */
const BASE = "http://localhost:3000";

const PEDIDO_TESTE = {
  id:           "pix_char_TESTE_001",
  name:         "Cliente Teste abcMusic",
  phone:        "11999887766",
  mail:         "teste@abcmusic.com",
  plan:         "silver",
  amount:       "47.00",
  status:       "pendente",
  utm_source:   "FB",
  utm_campaign: "TESTE_CAMPANHA",
  utm_medium:   "paid",
  estilo:       "Gospel",
  letra:        "Esta é uma letra de teste para validar o fluxo completo do portal abcMusic.",
  ip:           "127.0.0.1",
};

async function testar() {
  console.log("=== TESTE DE FLUXO COMPLETO ===\n");

  // 1. Novo pedido (simula checkout)
  console.log("1. Criando novo pedido...");
  const r1 = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(PEDIDO_TESTE),
  });
  const d1 = await r1.json();
  console.log(`   Status: ${r1.status} →`, d1);

  // 2. Confirmar pagamento (simula AbacatePay)
  console.log("\n2. Confirmando pagamento pix...");
  const r2 = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", id: PEDIDO_TESTE.id }),
  });
  const d2 = await r2.json();
  console.log(`   Status: ${r2.status} →`, d2);

  // 3. Consultar dados (simula n8n buscando dados da campanha)
  console.log("\n3. Consultando dados do pedido (como o n8n faz)...");
  const r3 = await fetch(`${BASE}/api/checkout?id=${PEDIDO_TESTE.id}`);
  const d3 = await r3.json();
  console.log(`   Status: ${r3.status}`);
  console.log(`   Status do pedido: ${d3.data?.status}`);
  console.log(`   Nome: ${d3.data?.name}`);
  console.log(`   Estilo: ${d3.data?.estilo}`);

  console.log("\n=== RESULTADO ===");
  console.log(`Busque no portal por: 11999887766 ou teste@abcmusic.com`);
  console.log(`ID do pedido: ${PEDIDO_TESTE.id}`);
}

testar().catch(console.error);
