const XLSX = require("xlsx");
const arquivo = process.argv[2];
if (!arquivo) { console.error("Uso: node scripts/diagnostico-xlsx.js <arquivo.xlsx>"); process.exit(1); }

const wb = XLSX.readFile(arquivo);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

console.log("\n=== Colunas encontradas ===");
if (rows.length > 0) console.log(Object.keys(rows[0]));

console.log("\n=== Primeira linha ===");
if (rows.length > 0) console.log(rows[0]);

console.log(`\nTotal de linhas: ${rows.length}`);
