// Concilia um extrato do AbacatePay com a tabela Pedido.
//
//   npm run spedy:conciliar extrato_2026-08-01_2026-08-06.json         → mostra e pergunta
//   npm run spedy:conciliar extrato_2026-08-01_2026-08-06.json --sim   → sem confirmação
//
// O gateway é a verdade sobre o que foi pago. Quando o portal discorda, é porque o
// webhook de confirmação falhou ou o pedido nem chegou a ser criado — aconteceu em
// 27 vendas de julho e 9 dos primeiros seis dias de agosto. Sem isso a venda não
// vira nota, e pior: a música não é produzida, porque o fluxo depende do status.
//
// Duas correções, ambas seguras de repetir:
//   pendente com pagamento confirmado  → status = pago
//   pagamento sem pedido no portal     → cria o pedido a partir do extrato
//
// `estilo` e `letra` ficam nulos nos pedidos criados: o briefing se perdeu junto
// com o checkout e não há como recuperá-lo do extrato.
//
// Só relata, sem agir: cancelados com pagamento confirmado e valores divergentes.
// Os dois pedem decisão humana.

require("dotenv").config();
const fs = require("fs");
const readline = require("readline");
const { PrismaClient } = require("@prisma/client");
const { cpfValido, normalizarTelefone, dataBR } = require("../lib/spedy");

const prisma = new PrismaClient();
const dig = (v) => String(v || "").replace(/\D/g, "");

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(texto, (r) => { rl.close(); res(r.trim().toLowerCase()); }));
}

/** Aceita o JSON do AbacatePay; devolve só os depósitos de pagamento. */
function pagamentos(arquivo) {
  const bruto = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  if (!Array.isArray(bruto)) throw new Error("Formato inesperado: esperava um array de lançamentos.");
  return bruto.filter((r) => r.description === "Pagamento PIX" && r.paymentIntentId);
}

function pedidoDoExtrato(r) {
  const c = r.customer || {};
  const cpf = dig(c.taxId);
  const valor = Number(r.amount);
  return {
    id: r.paymentIntentId,
    nome: (c.name || "").trim() || "(sem nome)",
    nomefiscal: (c.name || "").trim() || null,
    cpf: cpfValido(cpf) ? cpf : "00000000000",
    email: c.email || "",
    telefone: normalizarTelefone(c.cellphone),
    plano: valor === 37 ? "basic" : valor === 47 ? "silver" : "",
    valor,
    status: "pago",
    data_pedido: new Date(r.createdAt),
    gerou_musica: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const semPergunta = args.includes("--sim");
  const arquivo = args.find((a) => !a.startsWith("--"));
  if (!arquivo) throw new Error("Informe o extrato. Ex.: npm run spedy:conciliar extrato.json");
  if (!fs.existsSync(arquivo)) throw new Error(`Não encontrei ${arquivo}`);

  const dep = pagamentos(arquivo);
  const ids = dep.map((r) => r.paymentIntentId);
  const regs = await prisma.pedido.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, valor: true, nome: true },
  });
  const mapa = Object.fromEntries(regs.map((r) => [r.id, r]));

  const aPagar = dep.filter((r) => mapa[r.paymentIntentId]?.status === "pendente");
  const aCriar = dep.filter((r) => !mapa[r.paymentIntentId]);
  const cancelados = dep.filter((r) => mapa[r.paymentIntentId]?.status === "cancelado");
  const divergentes = dep.filter((r) => {
    const b = mapa[r.paymentIntentId];
    return b && Number(b.valor) !== Number(r.amount);
  });
  const ok = dep.length - aPagar.length - aCriar.length - cancelados.length;

  console.log(`Extrato: ${arquivo}`);
  console.log(`  pagamentos: ${dep.length}   R$ ${dep.reduce((s, r) => s + Number(r.amount), 0).toFixed(2)}\n`);
  console.log(`  já corretos no portal:        ${ok}`);
  console.log(`  pendentes → viram pago:       ${aPagar.length}`);
  console.log(`  sem pedido → serão criados:   ${aCriar.length}`);
  console.log(`  cancelados (só aviso):        ${cancelados.length}`);
  console.log(`  valor divergente (só aviso):  ${divergentes.length}`);

  for (const [titulo, lista] of [["A MARCAR COMO PAGO", aPagar], ["A CRIAR", aCriar]]) {
    if (!lista.length) continue;
    console.log(`\n${titulo}:`);
    for (const r of lista) {
      console.log(`  ${dataBR(r.createdAt)}  R$ ${String(r.amount).padStart(3)}  ${String(r.customer?.name || "").slice(0, 26)}`);
    }
  }

  if (cancelados.length) {
    console.log("\nCANCELADOS com pagamento confirmado — decida caso a caso:");
    for (const r of cancelados) {
      console.log(`  ${r.paymentIntentId}  R$ ${r.amount}  ${String(r.customer?.name || "").slice(0, 26)}`);
    }
  }
  if (divergentes.length) {
    console.log("\nVALOR DIVERGENTE — confira antes de faturar:");
    for (const r of divergentes) {
      console.log(`  ${r.paymentIntentId}  portal R$ ${mapa[r.paymentIntentId].valor}  gateway R$ ${r.amount}`);
    }
  }

  if (!aPagar.length && !aCriar.length) {
    console.log("\nNada a corrigir.");
    return;
  }

  if (!semPergunta) {
    const r = await perguntar(`\nAplicar ${aPagar.length} atualizações e ${aCriar.length} criações? (sim/não) `);
    if (r !== "sim" && r !== "s") { console.log("Cancelado — nada foi alterado."); return; }
  }

  if (aPagar.length) {
    const res = await prisma.pedido.updateMany({
      where: { id: { in: aPagar.map((r) => r.paymentIntentId) }, status: "pendente" },
      data: { status: "pago" },
    });
    console.log(`\n✓ ${res.count} marcados como pago.`);
  }
  if (aCriar.length) {
    const res = await prisma.pedido.createMany({
      data: aCriar.map(pedidoDoExtrato),
      skipDuplicates: true,
    });
    console.log(`✓ ${res.count} pedidos criados (sem estilo/letra — briefing perdido).`);
  }
  console.log("\nGere o lote quando fechar o mês.");
}

main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
