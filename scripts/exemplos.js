require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const select = { nome: true, telefone: true, email: true, status: true, gerou_musica: true, entrega_whatsapp: true, entrega_email: true, link_audio: true };

  const ambosEntregues = await prisma.pedido.findMany({
    where: { entrega_whatsapp: true, entrega_email: true },
    select, take: 3,
  });

  const whatsErro = await prisma.pedido.findMany({
    where: { entrega_whatsapp: false, entrega_email: true },
    select, take: 3,
  });

  const emailErro = await prisma.pedido.findMany({
    where: { entrega_whatsapp: true, entrega_email: false },
    select, take: 3,
  });

  const pagoSemMusica = await prisma.pedido.findMany({
    where: { status: "pago", gerou_musica: false, link_audio: null },
    select, take: 3,
  });

  console.log(`\n=== AMBOS ENTREGUES (${ambosEntregues.length}) ===`);
  ambosEntregues.forEach(p => console.log(`  ${p.telefone} | ${p.email}`));

  console.log(`\n=== WHATSAPP COM ERRO, EMAIL OK (${whatsErro.length}) ===`);
  whatsErro.forEach(p => console.log(`  ${p.telefone} | ${p.email}`));

  console.log(`\n=== EMAIL COM ERRO, WHATSAPP OK (${emailErro.length}) ===`);
  emailErro.forEach(p => console.log(`  ${p.telefone} | ${p.email}`));

  console.log(`\n=== PAGO SEM MUSICA GERADA (${pagoSemMusica.length}) ===`);
  pagoSemMusica.forEach(p => console.log(`  ${p.telefone} | ${p.email} | status: ${p.status}`));

  await prisma.$disconnect();
}

main().catch(console.error);
