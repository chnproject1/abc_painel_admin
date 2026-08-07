// Gera o lote de vendas para importar na Spedy.
//
//   node scripts/gerar-lote-spedy.js                  → rótulo = data de hoje, sem corte
//   node scripts/gerar-lote-spedy.js --max=50         → no máximo 50 notas neste lote
//   node scripts/gerar-lote-spedy.js --ate=2026-07-31 → só vendas até essa data
//   node scripts/gerar-lote-spedy.js --de=2026-07-02  → só vendas a partir dessa data
//   node scripts/gerar-lote-spedy.js 2026-07-31       → rótulo específico
//
// Para fechar um mês, combine rótulo e corte:
//   node scripts/gerar-lote-spedy.js 2026-07-31 --ate=2026-07-31
//
// O --ate pega tudo com data até o limite — inclusive pendências de meses
// anteriores corrigidas depois, que é o certo: uma venda de junho corrigida em
// agosto ainda precisa de nota. Sem ele, o lote leva também o mês corrente.
//
// O --de recorta o começo, para quando parte de um dia já foi faturada em outro
// lote. E o --extrato acrescenta exceções: vendas fora da janela que mesmo assim
// devem entrar, identificadas por um extrato do AbacatePay.
//
//   node scripts/gerar-lote-spedy.js 2026-07-31 \
//     --de=2026-07-02 --ate=2026-07-31 --extrato=extrato_2026-07-01.csv
//
// Lê "do dia 2 ao 31, mais os pagamentos listados nesse extrato" — que podem ser
// do dia 1º. O extrato manda no que entra; a janela, no resto.
//
// O --max fatia o lote: as N vendas mais antigas entram no arquivo, o resto fica
// pendente e sai no lote seguinte. Use para validar o fluxo antes de subir milhares
// de linhas de uma vez.
//
// Saída numa pasta por lote — exports/{lote}/:
//   spedy-vendas-{lote}.xlsx      → sobe na Spedy (Ações em Lote > Importar vendas)
//   lote-{lote}.json              → lista de IDs; é o que marcar-lote-spedy.js consome
//   spedy-pendencias-{lote}.xlsx  → só existe se houver pedidos bloqueados
//
// NÃO altera nada no banco. Pode rodar quantas vezes quiser: gera, você corrige as
// pendências no portal, gera de novo. A marcação é um comando separado.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  SELECT_PEDIDO, hojeISO, inicioDoDiaBR, processar, planilhaVendas, planilhaPendencias, dirLote,
} = require("../lib/spedy");

const prisma = new PrismaClient();

/**
 * Resolve o rótulo do lote. Se o da data de hoje já foi marcado (importado na
 * Spedy), abre um novo com sufixo -b, -c… Se ainda não foi marcado, reaproveita:
 * é a mesma remessa sendo regerada depois de corrigir pendências.
 */
async function resolverLote(base) {
  const usados = new Set(
    (await prisma.pedido.findMany({
      where: { nota_lote: { startsWith: base } },
      select: { nota_lote: true },
      distinct: ["nota_lote"],
    })).map((p) => p.nota_lote),
  );
  if (!usados.has(base)) return base;
  for (let i = 1; i < 26; i++) {
    const rotulo = `${base}-${String.fromCharCode(97 + i)}`; // -b, -c, -d…
    if (!usados.has(rotulo)) return rotulo;
  }
  throw new Error(`Já existem 26 lotes em ${base}.`);
}

/**
 * Extrai os pix_char de um extrato do AbacatePay.
 *
 * Cada pagamento aparece em duas linhas — o depósito e a taxa da transação — com
 * o mesmo paymentIntentId. Filtrar por "Pagamento PIX" pega só o depósito e deixa
 * de fora taxas e eventuais estornos, que não devem virar nota.
 */
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
  const maxArg = args.find((a) => a.startsWith("--max="));
  const max = maxArg ? Number(maxArg.split("=")[1]) : null;
  if (maxArg && !(max > 0)) throw new Error(`--max inválido: "${maxArg}". Use --max=50.`);

  const ateArg = args.find((a) => a.startsWith("--ate="));
  const ate = ateArg ? ateArg.split("=")[1] : null;
  if (ateArg && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    throw new Error(`--ate inválido: "${ateArg}". Use --ate=2026-07-31.`);
  }

  const deArg = args.find((a) => a.startsWith("--de="));
  const de = deArg ? deArg.split("=")[1] : null;
  if (deArg && !/^\d{4}-\d{2}-\d{2}$/.test(de)) {
    throw new Error(`--de inválido: "${deArg}". Use --de=2026-07-02.`);
  }

  const extratoArg = args.find((a) => a.startsWith("--extrato="));
  const excecoes = extratoArg ? idsDoExtrato(extratoArg.slice("--extrato=".length)) : [];

  // O regex exige a data pura, então "--ate=2026-07-31" nunca casa aqui — dá para
  // usar o mesmo dia como rótulo e como corte: `... 2026-07-31 --ate=2026-07-31`.
  const arg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const base = arg || hojeISO();
  const lote = await resolverLote(base);

  // `--ate` é inclusivo: o corte é a meia-noite do dia seguinte, em São Paulo.
  // O Brasil não tem mais horário de verão, então somar 24h é exato.
  const limite = ate ? new Date(inicioDoDiaBR(ate).getTime() + 86400000) : null;
  const inicio = de ? inicioDoDiaBR(de) : null;

  // `data_pedido` é opcional no schema, então cada extremo precisa considerar o
  // fallback para `criado_em`.
  const janela = { AND: [] };
  if (inicio) {
    janela.AND.push({ OR: [
      { data_pedido: { gte: inicio } },
      { data_pedido: null, criado_em: { gte: inicio } },
    ] });
  }
  if (limite) {
    janela.AND.push({ OR: [
      { data_pedido: { lt: limite } },
      { data_pedido: null, criado_em: { lt: limite } },
    ] });
  }

  // As exceções do extrato entram mesmo estando fora da janela.
  const criterio = excecoes.length
    ? { OR: [janela, { id: { in: excecoes } }] }
    : janela;

  const pedidos = await prisma.pedido.findMany({
    where: { status: "pago", nota_importada: false, ...criterio },
    select: SELECT_PEDIDO,
    orderBy: { criado_em: "asc" },
  });

  const processado = processar(pedidos);
  const pendentes = processado.pendentes;

  // O limite corta só as vendas aptas — as pendências continuam listadas por
  // inteiro, senão você corrigiria os mesmos CPFs lote após lote sem ver o total.
  // Corta as mais antigas primeiro (a query vem ordenada por criado_em).
  const totalAptos = processado.aptos.length;
  const aptos = max ? processado.aptos.slice(0, max) : processado.aptos;
  const sobraram = totalAptos - aptos.length;

  const DIR = dirLote(lote);
  fs.mkdirSync(DIR, { recursive: true });

  // Confere antes de escrever qualquer coisa. No Windows, um .xlsx aberto no Excel
  // fica travado: sem esta checagem o script grava vendas e lote.json, falha no
  // arquivo de pendências e deixa a pasta com dados de gerações diferentes.
  const alvos = [
    `spedy-vendas-${lote}.xlsx`,
    `lote-${lote}.json`,
    `spedy-pendencias-${lote}.xlsx`,
  ].map((n) => path.join(DIR, n));
  const travados = alvos.filter((a) => {
    if (!fs.existsSync(a)) return false;
    try { fs.closeSync(fs.openSync(a, "r+")); return false; } catch { return true; }
  });
  if (travados.length) {
    throw new Error(
      `arquivo(s) em uso, feche o Excel antes de gerar:\n  ${travados.join("\n  ")}`,
    );
  }

  const arqVendas = path.join(DIR, `spedy-vendas-${lote}.xlsx`);
  fs.writeFileSync(arqVendas, planilhaVendas(aptos));

  // Guarda exatamente os IDs que foram para o arquivo. O script de marcação usa
  // esta lista, e não "tudo que está pendente agora" — que pode ter crescido.
  const arqLote = path.join(DIR, `lote-${lote}.json`);
  const valorTotal = Number(aptos.reduce((s, l) => s + Number(l.Venda_valortotal), 0).toFixed(2));
  fs.writeFileSync(arqLote, JSON.stringify({
    lote,
    gerado_em: new Date().toISOString(),
    total: aptos.length,
    valor_total: valorTotal,
    ids: aptos.map((l) => l.Venda_codigo),
  }, null, 1));

  console.log(`Lote ${lote}`);
  if (de || ate) {
    console.log(`  janela: ${de ? `de ${de}` : "desde o início"} ${ate ? `até ${ate}` : "sem limite final"}`);
  } else {
    console.log("  janela: nenhuma — leva tudo que está na fila");
  }
  if (excecoes.length) {
    const dentro = pedidos.filter((p) => excecoes.includes(p.id)).length;
    console.log(`  exceções do extrato: ${excecoes.length} no arquivo, ${dentro} entraram (o resto não está pago)`);
  }
  console.log(`  pagos aguardando nota: ${pedidos.length}`);
  console.log(`  aptos:                 ${aptos.length}  (R$ ${valorTotal.toFixed(2)})`);
  if (sobraram) {
    console.log(`     limitado a ${max} — ${sobraram} aptos ficam para o próximo lote`);
  }
  console.log(`  pendentes:             ${pendentes.length}`);
  console.log(`\n✓ ${arqVendas}`);
  console.log(`✓ ${arqLote}`);

  if (pendentes.length) {
    const arqPend = path.join(DIR, `spedy-pendencias-${lote}.xlsx`);
    fs.writeFileSync(arqPend, planilhaPendencias(pendentes));
    console.log(`✓ ${arqPend}`);

    // Resumo por motivo em vez da lista inteira — com milhares de pendências a
    // listagem linha a linha não é legível. O detalhe está na planilha.
    const porMotivo = {};
    for (const p of pendentes) {
      for (const m of p.Motivo.split("; ")) porMotivo[m] = (porMotivo[m] || 0) + 1;
    }
    console.log("\nPendências por motivo:");
    for (const [motivo, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)} × ${motivo}`);
    }
    console.log(`\n  Detalhe de cada uma em ${path.basename(arqPend)}`);
  }

  console.log(`\nDepois de importar na Spedy: node scripts/marcar-lote-spedy.js ${lote}`);
}

main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
