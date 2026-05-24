/**
 * Cria um usuário admin ou operador no banco.
 * Uso: node scripts/criar-usuario.js <email> <senha> <nome> <ADMIN|OPERADOR>
 */
require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const [, , email, senha, nome, role] = process.argv;

  if (!email || !senha || !nome) {
    console.error("Uso: node scripts/criar-usuario.js <email> <senha> <nome> [ADMIN|OPERADOR]");
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const roleNorm = (role ?? "OPERADOR").toUpperCase();

  if (!["ADMIN", "OPERADOR", "PRODUTOR"].includes(roleNorm)) {
    console.error("Role deve ser ADMIN, OPERADOR ou PRODUTOR");
    process.exit(1);
  }

  const usuario = await prisma.usuario.upsert({
    where: { email },
    create: { email, senha: senhaHash, nome, role: roleNorm },
    update: { senha: senhaHash, nome, role: roleNorm },
  });

  console.log(`Usuario ${roleNorm} criado/atualizado: ${usuario.email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
