// Backfill — roda UMA VEZ, antes do primeiro lote.
//
// Marca como já importado tudo que é anterior ao corte, para que o primeiro lote
// não venha com meses de vendas antigas. Sem isso, a coluna nasce com default
// false e a história inteira ficaria elegível.
//
//   node scripts/marcar-historico-spedy.js              → corte em 01/07/2026
//   node scripts/marcar-historico-spedy.js 2026-08-01   → outro corte
//   node scripts/marcar-historico-spedy.js --sim        → sem confirmação
//
// Para marcar uma faixa fechada, com exceções:
//   node scripts/marcar-historico-spedy.js 2026-07-02 \
//     --de=2026-07-01 --exceto=extrato.csv
//
// Lê "marque tudo de 01/07 até antes de 02/07, menos os pagamentos desse extrato".
// Foi como os pedidos do CNPJ anterior saíram de circulação: a troca aconteceu no
// meio do dia 1º, e só as vendas a partir das 22:50 pertencem ao CNPJ atual.

require("dotenv").config();
const fs = require("fs");
const readline = require("readline");
const { PrismaClient } = require("@prisma/client");
const { inicioDoDiaBR, dataBR } = require("../lib/spedy");

const prisma = new PrismaClient();

const CORTE_PADRAO = "2026-07-01";
const LOTE = "historico";

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(texto, (r) => { rl.close(); res(r.trim().toLowerCase()); }));
}

/** pix_char das linhas de pagamento de um extrato do AbacatePay. */
function idsDoExtrato(arquivo) {
  if (!fs.existsSync(arquivo)) throw new Error(`Extrato não encontrado: ${arquivo}`);
  const ids = new Set();
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    if (!linha.includes("Pagamento PIX")) continue;
    const m = /pix_char_[A-Za-z0-9]+/.exec(linha);
    if (m) ids.add(m[0]);
  }
  return [...ids];
}

async function main() {
  const args = process.argv.slice(2);
  const semPergunta = args.includes("--sim");
  const corteISO = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || CORTE_PADRAO;
  const corte = inicioDoDiaBR(corteISO);

  const deArg = args.find((a) => a.startsWith("--de="));
  const de = deArg ? deArg.split("=")[1] : null;
  if (deArg && !/^\d{4}-\d{2}-\d{2}$/.test(de)) {
    throw new Error(`--de inválido: "${deArg}". Use --de=2026-07-01.`);
  }
  const inicio = de ? inicioDoDiaBR(de) : null;

  const exArg = args.find((a) => a.startsWith("--exceto="));
  const excecoes = exArg ? idsDoExtrato(exArg.slice("--exceto=".length)) : [];

  // Vale para qualquer status: um pedido de junho que só for pago depois continua
  // sendo uma venda de junho, e a decisão foi emitir de julho em diante.
  const where = {
    nota_importada: false,
    AND: [
      { OR: [
        { data_pedido: { lt: corte } },
        { data_pedido: null, criado_em: { lt: corte } },
      ] },
      ...(inicio ? [{ OR: [
        { data_pedido: { gte: inicio } },
        { data_pedido: null, criado_em: { gte: inicio } },
      ] }] : []),
    ],
    ...(excecoes.length ? { id: { notIn: excecoes } } : {}),
  };

  const total = await prisma.pedido.count({ where });
  const pagos = await prisma.pedido.count({ where: { ...where, status: "pago" } });

  console.log(`Janela: ${de ? `de ${de} 00:00` : "desde o início"} até ${corteISO} 00:00 (exclusive), fuso de São Paulo`);
  if (excecoes.length) console.log(`Exceções preservadas: ${excecoes.length} ids do extrato`);
  console.log(`Pedidos na janela ainda não marcados: ${total} (${pagos} pagos)`);

  if (!total) {
    console.log("Nada a fazer.");
    return;
  }

  const amostra = await prisma.pedido.findMany({
    where,
    select: { id: true, nome: true, status: true, data_pedido: true, criado_em: true },
    orderBy: { criado_em: "desc" },
    take: 3,
  });
  console.log("\nMais recentes que serão marcados:");
  for (const p of amostra) {
    console.log(`  ${dataBR(p.data_pedido || p.criado_em)}  ${p.status.padEnd(9)} ${p.nome}`);
  }

  if (!semPergunta) {
    const r = await perguntar(`\nMarcar os ${total} como nota_lote="${LOTE}"? (sim/não) `);
    if (r !== "sim" && r !== "s") {
      console.log("Cancelado.");
      return;
    }
  }

  const res = await prisma.pedido.updateMany({
    where,
    data: { nota_importada: true, nota_lote: LOTE },
  });
  console.log(`\n✓ ${res.count} pedidos marcados. Eles nunca mais entram em lote.`);
}

main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
