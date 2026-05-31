const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 07/05/2026 18:40:21 horário de Brasília (UTC-3) = 21:40:21 UTC
const CORTE = new Date('2026-05-07T21:40:21.000Z');

async function main() {
  const total = await prisma.pedido.count();
  const antigos = await prisma.pedido.count({ where: { data_pedido: { lt: CORTE } } });
  const ficarao = total - antigos;

  console.log(`\nTotal no banco:        ${total}`);
  console.log(`Serão apagados:        ${antigos}  (antes de 07/05/2026 18:40:21 BRT)`);
  console.log(`Permanecerão:          ${ficarao}`);

  if (antigos === 0) {
    console.log('\nNenhum registro para apagar.');
    return;
  }

  console.log('\nApagando...');
  const { count } = await prisma.pedido.deleteMany({
    where: { data_pedido: { lt: CORTE } },
  });
  console.log(`✓ ${count} registros apagados.`);

  const restante = await prisma.pedido.count();
  console.log(`\nTotal atual no banco:  ${restante}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
