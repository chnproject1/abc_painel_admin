/**
 * Corrige os booleanos divergentes nos dados importados do Sheets.
 * Lógica: se tem link_audio → gerou_musica = true
 * Para entrega_whatsapp e entrega_email, re-importar o XLSX com o script
 * atualizado é mais preciso — este script só corrige o gerou_musica.
 */
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Corrige gerou_musica: true para quem tem link de áudio ou página
  const corrigidos = await prisma.pedido.updateMany({
    where: {
      gerou_musica: false,
      OR: [
        { link_audio: { not: null } },
        { link_pagina: { not: null } },
      ],
    },
    data: { gerou_musica: true },
  });

  console.log(`gerou_musica corrigido: ${corrigidos.count} registros`);

  // Mostra contagem atual dos booleanos para conferência
  const stats = await prisma.pedido.groupBy({
    by: ["gerou_musica", "entrega_whatsapp", "entrega_email"],
    _count: true,
    orderBy: { gerou_musica: "desc" },
  });

  console.log("\nDistribuição atual:");
  stats.forEach(s => {
    console.log(`  gerou=${s.gerou_musica} | whats=${s.entrega_whatsapp} | email=${s.entrega_email} → ${s._count} registros`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
