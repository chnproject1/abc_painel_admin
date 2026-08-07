// Lê a planilha de pendências corrigida à mão e grava as correções no banco.
//
//   npm run spedy:corrigir 2026-07-31          → mostra o que mudaria e pergunta
//   npm run spedy:corrigir 2026-07-31 --sim    → sem confirmação
//
// Você abre o spedy-pendencias-{lote}.xlsx, preenche as três colunas editáveis e
// salva. Este script compara com o banco e grava só o que mudou:
//
//   Cliente_nome     → nomefiscal
//   Cliente_cpfcnpj  → cpf
//   Cliente_celular  → telefone
//
// As colunas ref_* são só contexto para você identificar o pedido; nunca são lidas.
// Célula deixada em branco não apaga nada — significa "não mexi".
//
// Cada valor passa pela mesma validação do gerador antes de entrar: CPF com dígito
// verificador, nome não vazio, telefone com DDD que existe. Linha inválida é
// recusada e listada, sem bloquear as outras.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const {
  dirLote, dirExports, cpfValido, limparNome, dddDe, DDDS_VALIDOS,
} = require("../lib/spedy");

const prisma = new PrismaClient();
const dig = (v) => String(v ?? "").replace(/\D/g, "");

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(texto, (r) => { rl.close(); res(r.trim().toLowerCase()); }));
}

function acharPlanilha(lote) {
  const nome = `spedy-pendencias-${lote}.xlsx`;
  const candidatos = [
    path.join(dirLote(lote), nome),
    path.join(dirExports(), lote, nome),
    path.join(dirExports(), nome),
  ];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

/** Devolve o valor limpo, ou uma mensagem de erro. */
function validarCampo(coluna, valor) {
  const v = String(valor ?? "").trim();
  if (!v) return { vazio: true };

  if (coluna === "Cliente_cpfcnpj") {
    const d = dig(v);
    if (d === "00000000000") return { erro: "CPF ainda é o valor padrão" };
    if (d.length !== 11) return { erro: `CPF com ${d.length} dígitos` };
    if (!cpfValido(d)) return { erro: "CPF com dígito verificador inválido" };
    return { valor: d };
  }

  if (coluna === "Cliente_celular") {
    const ddd = dddDe(v);
    if (!ddd) return { erro: "telefone sem DDD reconhecível" };
    if (!DDDS_VALIDOS.has(ddd)) return { erro: `DDD ${ddd} não existe` };
    return { valor: dig(v) };
  }

  // Cliente_nome — guardamos como digitado; o acento só sai na hora de gerar a nota.
  if (!limparNome(v)) return { erro: "nome vazio depois de limpar" };
  return { valor: v };
}

async function main() {
  const args = process.argv.slice(2);
  const semPergunta = args.includes("--sim");
  const lote = args.find((a) => !a.startsWith("--"));
  if (!lote) throw new Error("Informe o lote. Ex.: npm run spedy:corrigir 2026-07-31");

  const arquivo = acharPlanilha(lote);
  if (!arquivo) throw new Error(`Não encontrei spedy-pendencias-${lote}.xlsx em ${dirLote(lote)}`);

  const wb = XLSX.readFile(arquivo);
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  console.log(`Planilha: ${arquivo}`);
  console.log(`Linhas: ${linhas.length}\n`);

  const ids = linhas.map((l) => String(l.Venda_codigo || "").trim()).filter(Boolean);
  const atuais = Object.fromEntries(
    (await prisma.pedido.findMany({
      where: { id: { in: ids } },
      select: { id: true, nomefiscal: true, cpf: true, telefone: true },
    })).map((p) => [p.id, p]),
  );

  const CAMPOS = { Cliente_nome: "nomefiscal", Cliente_cpfcnpj: "cpf", Cliente_celular: "telefone" };
  const updates = [];
  const erros = [];
  let semMudanca = 0, foraDoBanco = 0;

  for (const l of linhas) {
    const id = String(l.Venda_codigo || "").trim();
    if (!id) continue;
    const atual = atuais[id];
    if (!atual) { foraDoBanco++; erros.push(`${id}: não existe no banco`); continue; }

    const data = {};
    let temErro = false;
    for (const [coluna, campo] of Object.entries(CAMPOS)) {
      const digitado = String(l[coluna] ?? "").trim();
      if (!digitado) continue; // em branco = não mexi

      // Compara ANTES de validar. A célula que você não tocou ainda contém o valor
      // ruim que colocou o pedido na lista — revalidá-lo encheria a tela de
      // "recusadas" que não são suas. Só o que mudou é conferido.
      const comparavel = campo === "nomefiscal" ? digitado : dig(digitado);
      const antes = campo === "nomefiscal"
        ? String(atual[campo] ?? "").trim()
        : dig(atual[campo]);
      if (comparavel === antes) continue;

      const r = validarCampo(coluna, digitado);
      if (r.erro) { erros.push(`${id} · ${coluna}: ${r.erro} ("${digitado}")`); temErro = true; continue; }
      data[campo] = r.valor;
    }
    if (temErro) continue;
    if (!Object.keys(data).length) { semMudanca++; continue; }
    updates.push({ id, data, atual });
  }

  console.log(`  a atualizar:      ${updates.length}`);
  console.log(`  sem alteração:    ${semMudanca}`);
  console.log(`  com erro:         ${erros.length}`);
  if (foraDoBanco) console.log(`  fora do banco:    ${foraDoBanco}`);

  if (erros.length) {
    console.log("\nRecusadas (corrija na planilha e rode de novo):");
    for (const e of erros.slice(0, 25)) console.log(`  ${e}`);
    if (erros.length > 25) console.log(`  … e mais ${erros.length - 25}`);
  }

  if (!updates.length) {
    console.log("\nNada para gravar.");
    return;
  }

  console.log("\nMudanças (10 primeiras):");
  for (const u of updates.slice(0, 10)) {
    const partes = Object.entries(u.data).map(
      ([campo, v]) => `${campo}: "${u.atual[campo] ?? ""}" → "${v}"`,
    );
    console.log(`  ${u.id}\n    ${partes.join("\n    ")}`);
  }
  if (updates.length > 10) console.log(`  … e mais ${updates.length - 10}`);

  if (!semPergunta) {
    const r = await perguntar(`\nGravar ${updates.length} correções? (sim/não) `);
    if (r !== "sim" && r !== "s") { console.log("Cancelado — nada foi alterado."); return; }
  }

  let n = 0;
  for (const u of updates) {
    await prisma.pedido.update({ where: { id: u.id }, data: u.data });
    n++;
  }
  console.log(`\n✓ ${n} pedidos atualizados.`);
  console.log(`Gere o lote de novo: npm run spedy:lote -- ${lote} --ate=${lote}`);
}

main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
