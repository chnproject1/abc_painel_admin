// Confirma um lote — roda DEPOIS de a importação dar certo na Spedy.
//
//   node scripts/marcar-lote-spedy.js 2026-07-29
//   node scripts/marcar-lote-spedy.js 2026-07-29 --sim   → sem confirmação
//
// Marca nota_importada = true nos pedidos que foram naquele arquivo. A partir daí
// eles não voltam a aparecer em lote nenhum.
//
// Se a importação falhar na Spedy, simplesmente não rode este comando: os pedidos
// continuam pendentes e entram no próximo lote.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { PrismaClient } = require("@prisma/client");
const { dirExports, dirLote } = require("../lib/spedy");

const prisma = new PrismaClient();

/**
 * Caminho do JSON do lote, do layout atual para os antigos:
 *   exports/07.26/2026-07-31/   ← hoje: mês de alocação + pasta do lote
 *   exports/2026-07-31/         ← antes do agrupamento por mês
 *   exports/                    ← antes da pasta por lote
 * Assim um lote gerado numa versão anterior continua sendo confirmável.
 */
function acharArqLote(lote) {
  const arquivo = `lote-${lote}.json`;
  const candidatos = [
    path.join(dirLote(lote), arquivo),
    path.join(dirExports(), lote, arquivo),
    path.join(dirExports(), arquivo),
  ];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(texto, (r) => { rl.close(); res(r.trim().toLowerCase()); }));
}

async function main() {
  const args = process.argv.slice(2);
  const semPergunta = args.includes("--sim");
  const lote = args.find((a) => !a.startsWith("--"));

  if (!lote) {
    console.error("Informe o lote. Ex.: node scripts/marcar-lote-spedy.js 2026-07-29");
    process.exitCode = 1;
    return;
  }

  const arqLote = acharArqLote(lote);
  if (!arqLote) {
    console.error(`Não encontrei lote-${lote}.json em:`);
    console.error(`  ${dirLote(lote)}`);
    console.error(`  ${dirExports()}`);
    console.error("Gere o lote antes com gerar-lote-spedy.js.");
    process.exitCode = 1;
    return;
  }

  const { ids, total, valor_total } = JSON.parse(fs.readFileSync(arqLote, "utf8"));
  if (!Array.isArray(ids) || !ids.length) {
    console.log("Lote vazio — nada a marcar.");
    return;
  }

  const registros = await prisma.pedido.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, nota_importada: true, nota_lote: true },
  });

  // Proteção contra rodar duas vezes ou marcar um lote que já saiu em outro.
  const jaMarcados = registros.filter((p) => p.nota_importada);
  if (jaMarcados.length) {
    console.error(`Abortado: ${jaMarcados.length} pedido(s) deste lote já estão marcados.`);
    for (const p of jaMarcados.slice(0, 10)) {
      console.error(`  ${p.id}  ${p.nome}  → lote "${p.nota_lote}"`);
    }
    if (jaMarcados.length > 10) console.error(`  … e mais ${jaMarcados.length - 10}`);
    process.exitCode = 1;
    return;
  }

  const sumidos = ids.length - registros.length;
  console.log(`Lote ${lote}: ${total} pedidos, R$ ${Number(valor_total).toFixed(2)}`);
  if (sumidos > 0) console.log(`Atenção: ${sumidos} ID(s) do arquivo não existem mais no banco.`);

  if (!semPergunta) {
    const r = await perguntar(`\nConfirma que a importação na Spedy deu certo? (sim/não) `);
    if (r !== "sim" && r !== "s") {
      console.log("Cancelado — nada foi alterado.");
      return;
    }
  }

  const res = await prisma.pedido.updateMany({
    where: { id: { in: ids }, nota_importada: false },
    data: { nota_importada: true, nota_lote: lote },
  });
  console.log(`\n✓ ${res.count} pedidos marcados como lote "${lote}".`);
}

main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
