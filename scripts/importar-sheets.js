const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FILE_PATH = 'C:\\Users\\julia\\Downloads\\Webhook - Facebook (1).xlsx';
const BATCH_SIZE = 500;

function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return new Date(Date.UTC(date.y, date.m - 1, date.d, date.H || 0, date.M || 0, date.S || 0));
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function cleanPhone(tel) {
  if (!tel) return '';
  return String(tel).replace(/\D/g, '');
}

function str(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function whatsEntregue(whatsCol) {
  if (!whatsCol) return false;
  const s = String(whatsCol).toUpperCase().trim();
  // Não entregue via whatsapp
  if (
    s.includes('WHATS ERRO') ||
    s.includes('NÃO CHAMOU') || s.includes('NAO CHAMOU') ||
    s.includes('NÂO CHAMOU') || s.includes('NÃO CHAM') ||
    s.includes('NÃO ESCREV') ||
    s === 'FAZER' || s === 'DEVOLVIDO' || s === 'TESTE' ||
    s.startsWith('TELEFONE') || s.includes('CONFERIR') ||
    (s.includes('ERRO ENVIAR EMAIL') && !s.includes('WHATS ENTR') && !s.includes('ENTREGUE WHATS'))
  ) return false;
  // Entregue via whatsapp
  return (
    s.includes('WHATS ENTR') ||
    s.includes('ENTREGUE WHATS') ||
    s === 'ENTREGUE' || s === 'FEITO' || s === '✅' || s === 'ENTREGUIE'
  );
}

function emailEntregue(emailCol, whatsCol) {
  const check = (v) => {
    if (!v) return false;
    const s = String(v).toUpperCase();
    return s.includes('EMAIL ENTR') || s.includes('EMAIL ENVI') || s.includes('ENTREGUEI EMAIL');
  };
  return check(emailCol) || check(whatsCol);
}

function gerouMusica(val) {
  if (!val) return false;
  const s = String(val).toUpperCase().trim();
  // Gerou = SIM, ENTREGUE (e variantes), ERRO ENVIO (gerou mas falhou no envio)
  return s.includes('SIM') || s.includes('ENTR') || s.includes('ERRO ENVIO');
}

async function main() {
  console.log('Lendo arquivo Excel...');
  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`Total de linhas: ${rows.length}`);

  console.log('Limpando banco local...');
  await prisma.pedido.deleteMany();
  console.log('Banco limpo.');

  let inseridos = 0;
  let ignorados = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const data = [];
    for (const row of batch) {
      const id = str(row['ID']);
      if (!id) { ignorados++; continue; }

      const whatsCol = row['Entrega Whatsapp'];
      const emailCol = row['Entrega Email'];
      const gerouCol = row['Gerou Música'];

      let valorNum = null;
      if (row['Valor']) {
        const v = parseFloat(String(row['Valor']).replace(',', '.'));
        if (!isNaN(v)) valorNum = v;
      }

      data.push({
        id,
        nome:             str(row['Nome'])         || '',
        telefone:         cleanPhone(row['Telefone']),
        email:            (str(row['Email']) || '').split('?')[0].split('#')[0].trim(),
        plano:            str(row['Plano'])?.toLowerCase() || '',
        status:           str(row['Status'])?.toLowerCase() || 'pendente',
        valor:            valorNum,
        utm_source:       str(row['utmSource']),
        utm_campaign:     str(row['utmCampaign']),
        utm_medium:       str(row['utm_medium']),
        utm_content:      str(row['utm_content']),
        utm_term:         str(row['utm_term']),
        utm_id:           row['utm_id'] != null ? String(row['utm_id']) : null,
        fbclid:           str(row['fbclid']),
        estilo:           str(row['Estilo']),
        letra:            str(row['Letra']),
        ip:               row['IP'] != null ? String(row['IP']) : null,
        gerou_musica:     gerouMusica(gerouCol),
        erro_geracao:     false,
        link_pagina:      str(row['Link Página:']),
        link_basica:      str(row['Link Página Básica']),
        link_audio:       str(row['Link Áudio:']),
        song_id:          str(row['Song ID:']),
        link_mp4:         str(row['Link MP4']),
        data_entrega:     parseDate(row['Data Entrega:']),
        entrega_whatsapp: whatsEntregue(whatsCol),
        entrega_email:    emailEntregue(emailCol, whatsCol),
        data_pedido:      parseDate(row['Data']),
      });
    }

    if (data.length > 0) {
      await prisma.pedido.createMany({ data, skipDuplicates: true });
      inseridos += data.length;
    }

    process.stdout.write(`\rInseridos: ${inseridos} | Ignorados: ${ignorados}`);
  }

  console.log('\n\nImportação concluída!');
  console.log(`Total inseridos: ${inseridos}`);
  console.log(`Total ignorados (sem ID): ${ignorados}`);

  // Resumo
  const [total, pagos, entregues, erros] = await Promise.all([
    prisma.pedido.count(),
    prisma.pedido.count({ where: { status: 'pago' } }),
    prisma.pedido.count({ where: { status: 'pago', OR: [{ entrega_whatsapp: true }, { entrega_email: true }] } }),
    prisma.pedido.count({ where: { erro_geracao: true } }),
  ]);
  console.log(`\nResumo do banco:`);
  console.log(`  Total:          ${total}`);
  console.log(`  Pagos:          ${pagos}`);
  console.log(`  Entregues:      ${entregues}`);
  console.log(`  Pendentes:      ${pagos - entregues}`);
  console.log(`  Erro geração:   ${erros}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
