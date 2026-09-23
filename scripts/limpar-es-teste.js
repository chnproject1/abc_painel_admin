/**
 * Remove os pedidos de teste criados por scripts/seed-es-teste.js.
 * Apaga somente registros de PedidoEs cujo id começa com "cs_test_".
 *
 *   node scripts/limpar-us-teste.js           # mostra o que seria apagado
 *   node scripts/limpar-us-teste.js --confirmar  # apaga de fato
 *
 * Nunca toca na tabela Pedido (operação BR).
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PREFIXO = "cs_test_";

(async () => {
  const confirmar = process.argv.includes("--confirmar");
  const url = process.env.DATABASE_URL || "";
  console.log(`Banco: ${url.replace(/^.*@/, "").replace(/\/.*$/, "")}`);

  const alvos = await prisma.pedidoEs.findMany({
    where:  { id: { startsWith: PREFIXO } },
    select: { id: true, nome: true, plano: true },
    orderBy: { id: "asc" },
  });

  if (alvos.length === 0) {
    console.log(`Nenhum pedido com id iniciado em "${PREFIXO}". Nada a fazer.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n${alvos.length} pedido(s) de teste encontrado(s):`);
  alvos.forEach((p) => console.log(`  ${p.id}  ${p.plano.padEnd(15)} ${p.nome}`));

  if (!confirmar) {
    console.log("\nNada foi apagado. Rode de novo com --confirmar para remover.");
    await prisma.$disconnect();
    return;
  }

  const { count } = await prisma.pedidoEs.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  });

  const restantes = await prisma.pedidoEs.count();
  console.log(`\n${count} removido(s). Restam ${restantes} pedido(s) em PedidoEs.`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Erro:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
