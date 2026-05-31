const XLSX = require('xlsx');

const FILE_PATH = 'C:\\Users\\julia\\Downloads\\Webhook - Facebook (1).xlsx';

const wb = XLSX.readFile(FILE_PATH);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

console.log(`Total de linhas: ${rows.length}`);
console.log('\n--- Nomes das colunas ---');
if (rows[0]) console.log(Object.keys(rows[0]));

// Filtra só os pagos
const pagos = rows.filter(r => r['Status'] && String(r['Status']).toLowerCase().includes('pago'));
console.log(`\nTotal pagos: ${pagos.length}`);

// Conta valores únicos de "Gerou Música"
const gerouContagem = {};
for (const r of pagos) {
  const v = r['Gerou Música'] ?? '(vazio)';
  gerouContagem[v] = (gerouContagem[v] || 0) + 1;
}
console.log('\n--- Valores únicos em "Gerou Música" (pagos) ---');
Object.entries(gerouContagem)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  "${k}": ${v}`));

// Conta valores únicos de "Entrega Whatsapp"
const whatsContagem = {};
for (const r of pagos) {
  const v = r['Entrega Whatsapp'] ?? '(vazio)';
  whatsContagem[v] = (whatsContagem[v] || 0) + 1;
}
console.log('\n--- Valores únicos em "Entrega Whatsapp" (pagos) ---');
Object.entries(whatsContagem)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  "${k}": ${v}`));

// Conta valores únicos de "Entrega Email"
const emailContagem = {};
for (const r of pagos) {
  const v = r['Entrega Email'] ?? '(vazio)';
  emailContagem[v] = (emailContagem[v] || 0) + 1;
}
console.log('\n--- Valores únicos em "Entrega Email" (pagos) ---');
Object.entries(emailContagem)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  "${k}": ${v}`));
