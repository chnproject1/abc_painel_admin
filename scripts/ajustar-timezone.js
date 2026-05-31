const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Ajusta data_pedido e data_entrega subtraindo 3 horas (UTC → BRT)
// Use SOMENTE UMA VEZ. Se já foi rodado, as datas já estão corretas.

async function diagnostico() {
  const exemplos = await prisma.pedido.findMany({
    take: 5,
    orderBy: { data_pedido: 'desc' },
    select: { id: true, nome: true, data_pedido: true },
    where: { data_pedido: { not: null } },
  });

  console.log('\n=== 5 registros mais recentes (ANTES do ajuste) ===');
  for (const p of exemplos) {
    const brt = new Date(p.data_pedido.getTime() - 3 * 60 * 60 * 1000);
    console.log(`  ${p.nome?.padEnd(25)} | UTC: ${p.data_pedido.toISOString()} | BRT seria: ${brt.toLocaleString('pt-BR')}`);
  }
}

async function ajustar() {
  console.log('\nAjustando data_pedido (UTC → BRT = -3h)...');
  const r1 = await prisma.$executeRaw`
    UPDATE "Pedido"
    SET data_pedido = data_pedido - INTERVAL '3 hours'
    WHERE data_pedido IS NOT NULL
  `;
  console.log(`  ✓ ${r1} registros atualizados em data_pedido`);

  console.log('Ajustando data_entrega...');
  const r2 = await prisma.$executeRaw`
    UPDATE "Pedido"
    SET data_entrega = data_entrega - INTERVAL '3 hours'
    WHERE data_entrega IS NOT NULL
  `;
  console.log(`  ✓ ${r2} registros atualizados em data_entrega`);
}

async function main() {
  await diagnostico();

  const args = process.argv.slice(2);
  if (args.includes('--aplicar')) {
    await ajustar();
    console.log('\n✓ Ajuste concluído. Rode sem --aplicar para verificar o resultado.');
  } else {
    console.log('\n⚠️  Modo diagnóstico. Para aplicar, rode com: node scripts/ajustar-timezone.js --aplicar');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
