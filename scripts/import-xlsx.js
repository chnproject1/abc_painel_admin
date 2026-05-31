/**
 * Importa dados do arquivo XLSX para o PostgreSQL.
 * Uso: node scripts/import-xlsx.js <caminho-do-arquivo.xlsx>
 *
 * Requer DATABASE_URL no .env
 */
require("dotenv").config({ path: ".env" });

const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const path = require("path");

const prisma = new PrismaClient();

function excelDateToJS(serial) {
  if (!serial || typeof serial !== "number") return null;
  // Excel serial → UTC + 3h (Excel armazena como BRT, banco espera UTC)
  const date = new Date((serial - 25569) * 86400 * 1000 + 3 * 60 * 60 * 1000);
  return isNaN(date.getTime()) ? null : date;
}

function limparTelefone(tel) {
  if (!tel) return "";
  return String(tel).replace(/\D/g, "");
}

function booleanizar(val) {
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return s === "sim" || s === "true" || s === "1" || s === "yes";
}

function foiEntregue(val) {
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return s.includes("entregue");
}

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("Uso: node scripts/import-xlsx.js <arquivo.xlsx>");
    process.exit(1);
  }

  console.log(`Lendo arquivo: ${path.resolve(arquivo)}`);
  const workbook = XLSX.readFile(arquivo);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  console.log(`${rows.length} linhas encontradas. Importando...`);

  let ok = 0;
  let erros = 0;
  const lote = 500;

  for (let i = 0; i < rows.length; i += lote) {
    const bloco = rows.slice(i, i + lote);

    await Promise.allSettled(
      bloco.map(async (row) => {
        const id = row["ID"] ? String(row["ID"]).trim() : null;
        if (!id) return;

        try {
          await prisma.pedido.upsert({
            where: { id },
            create: {
              id,
              nome: String(row["Nome"] ?? "").trim(),
              telefone: limparTelefone(row["Telefone"]),
              email: String(row["Email"] ?? "").trim().toLowerCase(),
              plano: String(row["Plano"] ?? "").trim(),
              status: String(row["Status"] ?? "pendente").trim().toLowerCase(),
              estilo: row["Estilo"] ? String(row["Estilo"]).trim() : null,
              letra: row["Letra"] ? String(row["Letra"]).trim() : null,
              gerou_musica: booleanizar(row["Gerou Música"]) || !!(row["Link Áudio:"] || row["Link Página:"]),
              link_pagina: row["Link Página:"] ? String(row["Link Página:"]).trim() : null,
              link_basica: row["Link Página Básica"] ? String(row["Link Página Básica"]).trim() : null,
              link_audio: row["Link Áudio:"] ? String(row["Link Áudio:"]).trim() : null,
              song_id: row["Song ID:"] ? String(row["Song ID:"]).trim() : null,
              data_entrega: excelDateToJS(row["Data Entrega:"]),
              entrega_whatsapp: foiEntregue(row["Entrega Whatsapp"]),
              entrega_email: foiEntregue(row["Entrega Email"]),
              link_mp4: row["Link MP4"] ? String(row["Link MP4"]).trim() : null,
              // Admin only
              data_pedido: excelDateToJS(row["Data"]),
              valor: row["Valor"] ? parseFloat(String(row["Valor"])) : null,
              utm_source: row["utmSource"] ? String(row["utmSource"]).trim() : null,
              utm_campaign: row["utmCampaign"] ? String(row["utmCampaign"]).trim() : null,
              utm_medium: row["utm_medium"] ? String(row["utm_medium"]).trim() : null,
              utm_content: row["utm_content"] ? String(row["utm_content"]).trim() : null,
              utm_term: row["utm_term"] ? String(row["utm_term"]).trim() : null,
              utm_id: row["utm_id"] ? String(row["utm_id"]).trim() : null,
              fbclid: row["fbclid"] ? String(row["fbclid"]).trim() : null,
              ip: row["IP"] ? String(row["IP"]).trim() : null,
            },
            update: {
              nome: String(row["Nome"] ?? "").trim(),
              telefone: limparTelefone(row["Telefone"]),
              email: String(row["Email"] ?? "").trim().toLowerCase(),
              status: String(row["Status"] ?? "pendente").trim().toLowerCase(),
              estilo: row["Estilo"] ? String(row["Estilo"]).trim() : undefined,
              letra: row["Letra"] ? String(row["Letra"]).trim() : undefined,
              gerou_musica: booleanizar(row["Gerou Música"]) || !!(row["Link Áudio:"] || row["Link Página:"]),
              link_pagina: row["Link Página:"] ? String(row["Link Página:"]).trim() : undefined,
              link_basica: row["Link Página Básica"] ? String(row["Link Página Básica"]).trim() : undefined,
              link_audio: row["Link Áudio:"] ? String(row["Link Áudio:"]).trim() : undefined,
              song_id: row["Song ID:"] ? String(row["Song ID:"]).trim() : undefined,
              data_entrega: excelDateToJS(row["Data Entrega:"]) ?? undefined,
              entrega_whatsapp: foiEntregue(row["Entrega Whatsapp"]),
              entrega_email: foiEntregue(row["Entrega Email"]),
              link_mp4: row["Link MP4"] ? String(row["Link MP4"]).trim() : undefined,
            },
          });
          ok++;
        } catch (e) {
          erros++;
          if (erros <= 5) console.error(`  Erro na linha ${id}:`, e.message);
        }
      })
    );

    console.log(`  ${Math.min(i + lote, rows.length)}/${rows.length} processados...`);
  }

  console.log(`\nImportacao concluida: ${ok} ok, ${erros} erros.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
