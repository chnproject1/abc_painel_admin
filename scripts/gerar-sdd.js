const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, TableOfContents,
  LevelFormat, ExternalHyperlink,
} = require("docx");
const fs = require("fs");

// ─── Cores e estilos ───────────────────────────────────────────────────────
const COR_PRIMARY   = "2E7D32"; // verde avocado escuro
const COR_ACCENT    = "4CAF50"; // verde médio
const COR_HEADER_BG = "1B5E20"; // cabeçalho de tabela
const COR_ALT_ROW   = "F1F8F1"; // linhas alternadas
const COR_BORDER    = "A5D6A7"; // bordas de tabela
const COR_TEXT      = "212121";
const COR_SUBTITLE  = "555555";

const W_FULL = 9360; // largura útil A4 com margens 1" (DXA)

// ─── Helpers ───────────────────────────────────────────────────────────────
function border(color = COR_BORDER) {
  return { style: BorderStyle.SINGLE, size: 1, color };
}
function borders(color = COR_BORDER) {
  const b = border(color);
  return { top: b, bottom: b, left: b, right: b };
}
function cell(text, opts = {}) {
  const {
    bold = false, color = COR_TEXT, bg = null, width = null,
    italic = false, size = 20, align = AlignmentType.LEFT, vAlign = VerticalAlign.CENTER,
  } = opts;
  return new TableCell({
    borders: borders(),
    ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
    ...(bg ? { shading: { fill: bg, type: ShadingType.CLEAR } } : {}),
    verticalAlign: vAlign,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, bold, color, font: "Arial", size, italics: italic })],
    })],
  });
}
function hCell(text, width = null) {
  return cell(text, { bold: true, color: "FFFFFF", bg: COR_HEADER_BG, width, size: 20 });
}
function p(text, opts = {}) {
  const { bold = false, size = 22, color = COR_TEXT, italic = false,
          align = AlignmentType.LEFT, spacing = { before: 80, after: 80 } } = opts;
  return new Paragraph({
    alignment: align,
    spacing,
    children: [new TextRun({ text, bold, size, color, font: "Arial", italics: italic })],
  });
}
function run(text, opts = {}) {
  return new TextRun({ text, font: "Arial", ...opts });
}
function space(before = 160, after = 80) {
  return new Paragraph({ spacing: { before, after }, children: [run("")] });
}
function divider() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COR_ACCENT, space: 1 } },
    children: [run("")],
  });
}
function bullet(text, sub = false) {
  return new Paragraph({
    numbering: { reference: sub ? "bullets-sub" : "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [run(text, { size: 20, color: COR_TEXT })],
  });
}
function mono(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: "Courier New", size: 18, color: "1A237E" })],
  });
}

// ─── Seção de capa ─────────────────────────────────────────────────────────
function coverPage() {
  return [
    space(3000, 0),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [run("abcMusic", { bold: true, size: 72, color: COR_PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
      children: [run("Sistema de Gestão de Pedidos", { size: 32, color: COR_SUBTITLE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [run("Documento de Design de Sistema", { bold: true, size: 40, color: COR_TEXT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [run("Software Design Document — SDD", { size: 26, color: COR_SUBTITLE, italics: true })],
    }),
    space(400, 0),
    new Table({
      width: { size: 6000, type: WidthType.DXA },
      columnWidths: [2400, 3600],
      rows: [
        new TableRow({ children: [hCell("Versão", 2400),           cell("1.0", { width: 3600 })] }),
        new TableRow({ children: [hCell("Data", 2400),             cell("Maio / 2026", { width: 3600 })] }),
        new TableRow({ children: [hCell("Status", 2400),           cell("Em Desenvolvimento", { width: 3600 })] }),
        new TableRow({ children: [hCell("Classificação", 2400),    cell("Interno — Confidencial", { width: 3600 })] }),
        new TableRow({ children: [hCell("Produto", 2400),          cell("abcMusic Admin Portal", { width: 3600 })] }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── Controle de versões ───────────────────────────────────────────────────
function versionTable() {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 },
      children: [run("Controle de Versões", { bold: true, size: 32, color: COR_PRIMARY })] }),
    new Table({
      width: { size: W_FULL, type: WidthType.DXA },
      columnWidths: [1200, 1500, 3660, 3000],
      rows: [
        new TableRow({ children: [hCell("Versão", 1200), hCell("Data", 1500), hCell("Descrição", 3660), hCell("Autor", 3000)] }),
        new TableRow({ children: [
          cell("1.0", { width: 1200 }),
          cell("Mai/2026", { width: 1500 }),
          cell("Criação inicial do documento", { width: 3660 }),
          cell("abcMusic", { width: 3000 }),
        ]}),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── Tabela de APIs ────────────────────────────────────────────────────────
function apiTable(rows) {
  const colWidths = [2200, 1400, 1600, 4160];
  return new Table({
    width: { size: W_FULL, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: [
        hCell("Endpoint", colWidths[0]),
        hCell("Método", colWidths[1]),
        hCell("Acesso", colWidths[2]),
        hCell("Descrição", colWidths[3]),
      ]}),
      ...rows.map(([ep, met, ac, desc], i) => new TableRow({
        children: [
          cell(ep,   { width: colWidths[0], bg: i % 2 ? COR_ALT_ROW : null }),
          cell(met,  { width: colWidths[1], bg: i % 2 ? COR_ALT_ROW : null, bold: true, color: COR_PRIMARY }),
          cell(ac,   { width: colWidths[2], bg: i % 2 ? COR_ALT_ROW : null, italic: true }),
          cell(desc, { width: colWidths[3], bg: i % 2 ? COR_ALT_ROW : null }),
        ],
      })),
    ],
  });
}

// ─── Tabela genérica de dois campos ───────────────────────────────────────
function twoColTable(rows, w1 = 3120, w2 = 6240) {
  return new Table({
    width: { size: W_FULL, type: WidthType.DXA },
    columnWidths: [w1, w2],
    rows: rows.map(([a, b], i) => new TableRow({
      children: [
        cell(a, { width: w1, bold: true, bg: i % 2 ? COR_ALT_ROW : null }),
        cell(b, { width: w2, bg: i % 2 ? COR_ALT_ROW : null }),
      ],
    })),
  });
}

function headerRow(labels, widths) {
  return new TableRow({ children: labels.map((l, i) => hCell(l, widths[i])) });
}

// ─── Documento principal ───────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "bullets-sub", levels: [{ level: 0, format: LevelFormat.BULLET, text: "◦",
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: COR_TEXT } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, color: COR_PRIMARY, font: "Arial" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COR_ACCENT, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: COR_PRIMARY, font: "Arial" },
        paragraph: { spacing: { before: 300, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: "33691E", font: "Arial" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COR_ACCENT, space: 4 } },
          spacing: { before: 0, after: 160 },
          children: [
            run("abcMusic", { bold: true, size: 18, color: COR_PRIMARY }),
            run("  |  Software Design Document  |  v1.0", { size: 18, color: COR_SUBTITLE }),
          ],
        }),
      ]}),
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: COR_ACCENT, space: 4 } },
          spacing: { before: 160, after: 0 },
          children: [
            run("Confidencial — Uso Interno  |  Página ", { size: 18, color: COR_SUBTITLE }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: COR_SUBTITLE }),
            run(" de ", { size: 18, color: COR_SUBTITLE }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: COR_SUBTITLE }),
          ],
        }),
      ]}),
    },
    children: [
      // ── Capa ──────────────────────────────────────────────────────────
      ...coverPage(),

      // ── Controle de versões ───────────────────────────────────────────
      ...versionTable(),

      // ── Sumário ───────────────────────────────────────────────────────
      new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-3" }),
      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 1. INTRODUÇÃO
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("1. Introdução")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("1.1 Propósito")] }),
      p("Este documento descreve o design técnico e funcional do abcMusic Admin Portal — sistema interno de gestão de pedidos de músicas personalizadas. O documento serve como referência para desenvolvimento, manutenção, integração com sistemas externos e onboarding de novos membros da equipe."),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("1.2 Escopo")] }),
      p("O portal abrange:"),
      bullet("Recebimento e armazenamento de pedidos oriundos do checkout (Netlify)"),
      bullet("Confirmação de pagamentos via AbacatePay"),
      bullet("Disparo e recebimento de callbacks do fluxo de produção musical (n8n)"),
      bullet("Interface administrativa com controle de acesso por perfil"),
      bullet("Substituição do Google Sheets como banco de dados operacional"),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("1.3 Definições e Siglas")] }),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [2400, 6960],
        rows: [
          new TableRow({ children: [hCell("Termo", 2400), hCell("Definição", 6960)] }),
          ...([
            ["SDD", "Software Design Document — documento de design técnico do sistema"],
            ["n8n", "Plataforma de automação de fluxos (workflow) utilizada para produção musical"],
            ["AbacatePay", "Gateway de pagamento PIX utilizado no checkout"],
            ["Netlify", "Plataforma de hospedagem do checkout (frontend)"],
            ["UTMify", "Ferramenta de rastreamento de campanhas de marketing"],
            ["RBAC", "Role-Based Access Control — controle de acesso baseado em perfis"],
            ["VPS", "Virtual Private Server — servidor onde o portal é hospedado"],
            ["PIX ID", "Identificador único do pagamento gerado pelo AbacatePay (ex: pix_char_xxx)"],
            ["Webhook", "Notificação HTTP enviada automaticamente entre sistemas"],
          ].map(([a, b], i) => new TableRow({ children: [
            cell(a, { width: 2400, bold: true, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 6960, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 2. VISÃO GERAL DO SISTEMA
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("2. Visão Geral do Sistema")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("2.1 Contexto")] }),
      p("O abcMusic comercializa músicas personalizadas via checkout online. O processo de pedido, pagamento e produção envolve múltiplos sistemas integrados. Anteriormente, o Google Sheets atuava como banco de dados central; o portal substitui essa função com um banco PostgreSQL gerenciado pelo backend Next.js, mantendo compatibilidade total com os sistemas externos existentes."),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("2.2 Componentes do Ecossistema")] }),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [2800, 2200, 4360],
        rows: [
          new TableRow({ children: [hCell("Componente", 2800), hCell("Tecnologia", 2200), hCell("Responsabilidade", 4360)] }),
          ...([
            ["Portal Admin",     "Next.js 14 + PostgreSQL", "Armazenamento, APIs e interface de gestão"],
            ["Checkout",         "Netlify (frontend)",      "Captura de dados do cliente e disparo do fluxo"],
            ["Gateway de Pag.",  "AbacatePay",              "Geração e confirmação de pagamentos PIX"],
            ["Automação",        "n8n (cloud)",             "Produção musical: GPT + Suno API"],
            ["Rastreamento",     "UTMify",                  "Atribuição de conversões a campanhas"],
            ["Banco de Dados",   "PostgreSQL 17",           "Persistência de todos os dados de pedidos"],
          ].map(([a, b, c], i) => new TableRow({ children: [
            cell(a, { width: 2800, bold: true, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 2200, bg: i % 2 ? COR_ALT_ROW : null, color: COR_PRIMARY }),
            cell(c, { width: 4360, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("2.3 Stack Tecnológico")] }),
      twoColTable([
        ["Framework",        "Next.js 14 (App Router)"],
        ["Linguagem",        "TypeScript"],
        ["ORM",              "Prisma v5"],
        ["Banco de Dados",   "PostgreSQL 17"],
        ["Autenticação",     "NextAuth.js v4 — JWT + Credentials Provider"],
        ["Estilização",      "Tailwind CSS com paleta verde avocado customizada"],
        ["Gerenciamento",    "PM2 (processo na VPS)"],
        ["Controle de Versão","Git"],
      ], 2600, 6760),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 3. FLUXO DO SISTEMA
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("3. Fluxo do Sistema")] }),
      p("O fluxo completo abrange desde o preenchimento do formulário pelo cliente até a confirmação de entrega da música. Cada etapa é descrita a seguir."),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.1 Diagrama de Fluxo")] }),
      mono("[Cliente] → Formulário Netlify"),
      mono("        ↓"),
      mono("POST /api/checkout          ← cria pedido (status: pendente)"),
      mono("        ↓"),
      mono("[AbacatePay] → Webhook → Netlify"),
      mono("        ↓"),
      mono("POST /api/checkout          ← action:update → status: pago"),
      mono("        ↓"),
      mono("GET  /api/checkout?id=xxx   ← busca dados do cliente"),
      mono("        ↓"),
      mono("UTMify (registro de conversão)"),
      mono("        ↓"),
      mono("Webhook n8n → [GPT + Suno] → música gerada"),
      mono("        ↓"),
      mono("POST /api/n8n  action:music_ready   ← links e song_id registrados"),
      mono("        ↓"),
      mono("WhatsApp → POST /api/n8n  action:whats_entregue / whats_erro"),
      mono("        ↓"),
      mono("Email   → POST /api/n8n  action:email_entregue / email_erro"),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.2 Etapa 1 — Entrada do Pedido (Checkout)")] }),
      p("O cliente preenche o formulário no Netlify. Ao confirmar, o checkout envia um POST para /api/checkout criando o pedido no banco com status pendente."),
      p("Campos recebidos:", { bold: true }),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [2600, 6760],
        rows: [
          new TableRow({ children: [hCell("Campo", 2600), hCell("Descrição", 6760)] }),
          ...([
            ["id",           "ID do PIX gerado pelo AbacatePay (ex: pix_char_xxx)"],
            ["name",         "Nome completo do cliente"],
            ["phone",        "Telefone (normalizado para somente dígitos)"],
            ["mail",         "Email do cliente"],
            ["plan",         "Plano contratado (silver, gold, etc.)"],
            ["amount",       "Valor pago"],
            ["estilo",       "Estilo musical escolhido pelo cliente"],
            ["letra",        "Letra enviada pelo cliente"],
            ["utm_*",        "Parâmetros de rastreamento de campanha (source, medium, campaign, etc.)"],
            ["fbclid",       "Identificador de clique do Facebook Ads"],
            ["ip",           "Endereço IP do cliente"],
          ].map(([a, b], i) => new TableRow({ children: [
            cell(a, { width: 2600, bold: true, bg: i % 2 ? COR_ALT_ROW : null, color: COR_PRIMARY }),
            cell(b, { width: 6760, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.3 Etapa 2 — Confirmação de Pagamento (AbacatePay)")] }),
      p("Após o pagamento PIX ser confirmado, o AbacatePay envia um webhook ao Netlify. O Netlify então chama o portal para atualizar o status do pedido para pago."),
      p("Payload enviado ao portal:"),
      mono('POST /api/checkout'),
      mono('{ "action": "update", "id": "pix_char_xxx" }'),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.4 Etapa 3 — Disparo do n8n (Netlify → n8n)")] }),
      p("Após confirmar o pagamento, o Netlify realiza duas ações em sequência:"),
      bullet("Busca os dados do pedido: GET /api/checkout?id=xxx"),
      bullet("Envia os dados ao UTMify para rastreamento de conversão"),
      bullet("Aciona o webhook do n8n para iniciar a produção musical"),
      p("Os campos retornados pelo portal ao Netlify mantêm os mesmos nomes utilizados anteriormente pelo Google Apps Script (id, name, phone, mail, plan, estilo, letra, utm_*), garantindo compatibilidade sem alterações no código do Netlify. O campo id (payment_id) também é retornado para que o n8n possa referenciar o pedido nos nós de callback."),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.5 Etapa 4 — Produção da Música (n8n)")] }),
      p("O fluxo n8n realiza as seguintes operações internas:"),
      bullet("Recebe os dados do pedido (letra, estilo, plano)"),
      bullet("Processa a letra com GPT (adaptação ou geração)"),
      bullet("Envia para a Suno API para geração do áudio"),
      bullet("Obtém os links: link_pagina, link_audio, link_basica, song_id"),
      p("Ao finalizar, notifica o portal:"),
      mono('POST /api/n8n'),
      mono('{ "action": "music_ready", "id": "pix_char_xxx",'),
      mono('  "link_pagina": "...", "link_audio": "...",'),
      mono('  "link_basica": "...", "song_id": "...", "data_entrega": "..." }'),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.6 Etapa 5 — Entrega via WhatsApp")] }),
      p("O n8n envia a música ao cliente via WhatsApp e notifica o portal com o resultado:"),
      mono('{ "action": "whats_entregue", "id": "..." }  → entrega_whatsapp = true'),
      mono('{ "action": "whats_erro",     "id": "..." }  → entrega_whatsapp = false'),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.7 Etapa 6 — Entrega via Email")] }),
      p("O n8n envia a música ao cliente por email e notifica o portal:"),
      mono('{ "action": "email_entregue", "id": "..." }  → entrega_email = true'),
      mono('{ "action": "email_erro",     "id": "..." }  → entrega_email = false'),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.8 Etapa 7 — Tratamento de Erros de Geração")] }),
      p("Em caso de falha na geração (Suno API indisponível, erro GPT, etc.):"),
      mono('{ "action": "erro_geracao", "id": "..." }  → gerou_musica = false'),
      p("O status do pedido não é alterado (permanece pago ou pendente). O portal exibe o card em vermelho — pago sem música gerada — como sinal de alerta para a equipe."),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("3.9 Indicadores Visuais no Portal")] }),
      p("Os cards de pedido na tela de busca usam cores para indicar o estado do pedido:"),
      space(80, 80),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [1800, 3000, 4560],
        rows: [
          new TableRow({ children: [hCell("Cor", 1800), hCell("Condição", 3000), hCell("Mensagem exibida", 4560)] }),
          new TableRow({ children: [
            cell("Vermelho", { width: 1800, bold: true, color: "C62828" }),
            cell("Pago + música não gerada", { width: 3000 }),
            cell("Pago — música não gerada", { width: 4560, italic: true }),
          ]}),
          new TableRow({ children: [
            cell("Amarelo", { width: 1800, bold: true, color: "F57F17", bg: COR_ALT_ROW }),
            cell("Pago + música gerada + não entregue (WhatsApp e email)", { width: 3000, bg: COR_ALT_ROW }),
            cell("Música gerada — aguardando entrega", { width: 4560, italic: true, bg: COR_ALT_ROW }),
          ]}),
          new TableRow({ children: [
            cell("Branco", { width: 1800 }),
            cell("Normal (entregue em ao menos um canal)", { width: 3000 }),
            cell("—", { width: 4560 }),
          ]}),
        ],
      }),
      space(),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 4. ARQUITETURA DO CÓDIGO
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("4. Arquitetura do Código")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("4.1 Estrutura de Diretórios")] }),
      mono("abc-music-admin/"),
      mono("├── app/"),
      mono("│   ├── (auth)/login/page.tsx          # Tela de login"),
      mono("│   ├── dashboard/"),
      mono("│   │   ├── page.tsx                   # Busca de pedidos"),
      mono("│   │   └── pedido/[id]/page.tsx        # Detalhe do pedido"),
      mono("│   └── api/"),
      mono("│       ├── auth/[...nextauth]/         # NextAuth"),
      mono("│       ├── checkout/route.ts           # Público — entrada e pagamento"),
      mono("│       ├── search/route.ts             # Autenticado — busca"),
      mono("│       ├── pedido/[id]/route.ts        # Autenticado — detalhes e edição"),
      mono("│       ├── trigger/[id]/route.ts       # Autenticado — dispara n8n"),
      mono("│       └── n8n/route.ts               # Público c/ secret — callback n8n"),
      mono("├── lib/"),
      mono("│   ├── auth.ts                        # Config NextAuth + bcrypt"),
      mono("│   ├── prisma.ts                      # Cliente Prisma (singleton)"),
      mono("│   └── columns.ts                     # Colunas visíveis por perfil"),
      mono("├── prisma/schema.prisma               # Schema do banco"),
      mono("├── middleware.ts                      # Proteção de rotas"),
      mono("└── scripts/                           # Scripts utilitários"),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("4.2 Descrição dos Módulos Principais")] }),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [3600, 5760],
        rows: [
          new TableRow({ children: [hCell("Arquivo", 3600), hCell("Responsabilidade", 5760)] }),
          ...([
            ["app/dashboard/page.tsx",         "Interface de busca por telefone ou email. Persiste a busca na URL para manter estado ao navegar."],
            ["app/dashboard/pedido/[id]/page.tsx", "Exibe detalhes do pedido, permite edição de letra e estilo, e dispara o n8n."],
            ["app/api/checkout/route.ts",      "Endpoint público que substitui o Google Apps Script. Recebe novos pedidos (POST) e confirma pagamentos (POST action:update). Retorna dados para Netlify (GET)."],
            ["app/api/n8n/route.ts",           "Callback do n8n. Atualiza o banco com os resultados da produção (música gerada, entregas, erros)."],
            ["app/api/trigger/[id]/route.ts",  "Aciona o webhook do n8n via backend, ocultando a URL do frontend."],
            ["lib/columns.ts",                 "Define quais campos do banco são visíveis para cada perfil (ADMIN, OPERADOR, PRODUTOR) usando selectPorRole()."],
            ["lib/auth.ts",                    "Configuração do NextAuth com Credentials Provider e bcrypt para senhas."],
            ["middleware.ts",                  "Protege as rotas /dashboard e /api/* (exceto /api/checkout e /api/n8n) exigindo sessão ativa."],
          ].map(([a, b], i) => new TableRow({ children: [
            cell(a, { width: 3600, bold: true, color: COR_PRIMARY, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 5760, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 5. ESPECIFICAÇÃO DAS APIs
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("5. Especificação das APIs")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("5.1 Endpoints Públicos")] }),
      p("Não exigem autenticação. Chamados por sistemas externos (Netlify, AbacatePay)."),
      space(80, 80),
      apiTable([
        ["/api/checkout", "POST", "Público", "Cria novo pedido (checkout) ou atualiza status para pago (action:update)"],
        ["/api/checkout", "GET",  "Público", "Retorna dados do pedido por ID para o Netlify encaminhar ao n8n e UTMify"],
        ["/api/n8n",      "POST", "Secret",  "Callback do n8n: registra resultados da produção (música, entregas, erros)"],
      ]),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("5.2 Endpoints Autenticados")] }),
      p("Exigem sessão ativa (login). Usados pelo frontend do portal."),
      space(80, 80),
      apiTable([
        ["/api/search",        "GET",   "Autenticado", "Busca pedidos por telefone ou email. Retorna campos filtrados por perfil."],
        ["/api/pedido/:id",    "GET",   "Autenticado", "Retorna todos os campos do pedido visíveis para o perfil do usuário."],
        ["/api/pedido/:id",    "PATCH", "Autenticado", "Edita o pedido. ADMIN: qualquer campo. OPERADOR/PRODUTOR: letra e estilo."],
        ["/api/trigger/:id",   "POST",  "Autenticado", "Aciona o webhook do n8n com o payment_id. URL do n8n protegida no backend."],
      ]),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("5.3 Actions do Callback n8n (/api/n8n)")] }),
      p("O endpoint /api/n8n aceita um POST com o campo action para determinar qual atualização realizar:"),
      space(80, 80),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [2600, 3200, 3560],
        rows: [
          new TableRow({ children: [hCell("Action", 2600), hCell("Campos atualizados", 3200), hCell("Substituição no Sheets", 3560)] }),
          ...([
            ["music_ready",    "gerou_musica=true, link_pagina, link_basica, link_audio, song_id, data_entrega", "Sheets - Marcar Gerou Música"],
            ["whats_entregue", "entrega_whatsapp = true",  "Update Whats (WHATS ENTREGUE)"],
            ["whats_erro",     "entrega_whatsapp = false", "Update Whats ERRO"],
            ["email_entregue", "entrega_email = true",     "Update Email"],
            ["email_erro",     "entrega_email = false",    "Update Email Erro"],
            ["erro_geracao",   "gerou_musica=false (status não muda)", "Update Status / Update Plan"],
          ].map(([a, b, c], i) => new TableRow({ children: [
            cell(a, { width: 2600, bold: true, color: COR_PRIMARY, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 3200, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(c, { width: 3560, bg: i % 2 ? COR_ALT_ROW : null, italic: true }),
          ]}))),
        ],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 6. MODELO DE DADOS
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("6. Modelo de Dados")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("6.1 Tabela Pedido")] }),
      p("Tabela principal. Cada registro representa um pedido de música personalizada."),
      space(80, 80),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [2400, 1800, 800, 4360],
        rows: [
          new TableRow({ children: [hCell("Coluna", 2400), hCell("Tipo", 1800), hCell("Nulo?", 800), hCell("Descrição", 4360)] }),
          ...([
            ["id",               "String (PK)",  "Não", "ID do PIX (ex: pix_char_xxx)"],
            ["nome",             "String",       "Não", "Nome completo do cliente"],
            ["telefone",         "String",       "Não", "Telefone — somente dígitos (indexado)"],
            ["email",            "String",       "Não", "Email do cliente (indexado)"],
            ["plano",            "String",       "Não", "Plano contratado (silver, gold...)"],
            ["status",           "String",       "Não", "pendente / pago / concluido / cancelado / erro"],
            ["estilo",           "String?",      "Sim", "Estilo musical escolhido"],
            ["letra",            "Text?",        "Sim", "Letra da música (texto longo)"],
            ["gerou_musica",     "Boolean",      "Não", "Música foi gerada pelo Suno"],
            ["link_pagina",      "String?",      "Sim", "URL da página da música"],
            ["link_basica",      "String?",      "Sim", "Link básico"],
            ["link_audio",       "String?",      "Sim", "Link direto do áudio"],
            ["link_mp4",         "String?",      "Sim", "Link do vídeo MP4"],
            ["song_id",          "String?",      "Sim", "ID da música na Suno API"],
            ["data_entrega",     "DateTime?",    "Sim", "Data/hora em que a música foi gerada"],
            ["entrega_whatsapp", "Boolean",      "Não", "Música entregue via WhatsApp"],
            ["entrega_email",    "Boolean",      "Não", "Música entregue via email"],
            ["valor",            "Decimal?",     "Sim", "Valor pago (visível somente para ADMIN)"],
            ["data_pedido",      "DateTime?",    "Sim", "Data e hora do pedido"],
            ["utm_source",       "String?",      "Sim", "Origem da campanha (ex: facebook)"],
            ["utm_campaign",     "String?",      "Sim", "Nome da campanha"],
            ["utm_medium",       "String?",      "Sim", "Mídia (ex: cpc)"],
            ["utm_content",      "String?",      "Sim", "Criativo"],
            ["utm_term",         "String?",      "Sim", "Termo de busca"],
            ["utm_id",           "String?",      "Sim", "ID da campanha"],
            ["fbclid",           "String?",      "Sim", "ID de clique do Facebook"],
            ["ip",               "String?",      "Sim", "IP do cliente (visível somente para ADMIN)"],
            ["criado_em",        "DateTime",     "Não", "Timestamp de criação (automático)"],
            ["atualizado_em",    "DateTime",     "Não", "Timestamp de atualização (automático)"],
          ].map(([a, b, c, d], i) => new TableRow({ children: [
            cell(a, { width: 2400, bold: true, color: COR_PRIMARY, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 1800, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(c, { width: 800,  bg: i % 2 ? COR_ALT_ROW : null, align: AlignmentType.CENTER }),
            cell(d, { width: 4360, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("6.2 Tabela Usuario")] }),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [2400, 1800, 800, 4360],
        rows: [
          new TableRow({ children: [hCell("Coluna", 2400), hCell("Tipo", 1800), hCell("Nulo?", 800), hCell("Descrição", 4360)] }),
          ...([
            ["id",         "Int (PK auto)", "Não", "Identificador único"],
            ["nome",       "String",        "Não", "Nome do usuário"],
            ["email",      "String",        "Não", "Email de login (único)"],
            ["senha",      "String",        "Não", "Senha hasheada com bcryptjs"],
            ["role",       "Enum",          "Não", "ADMIN | OPERADOR | PRODUTOR"],
            ["criado_em",  "DateTime",      "Não", "Timestamp de criação (automático)"],
          ].map(([a, b, c, d], i) => new TableRow({ children: [
            cell(a, { width: 2400, bold: true, color: COR_PRIMARY, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 1800, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(c, { width: 800,  bg: i % 2 ? COR_ALT_ROW : null, align: AlignmentType.CENTER }),
            cell(d, { width: 4360, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 7. SEGURANÇA E CONTROLE DE ACESSO
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("7. Segurança e Controle de Acesso")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("7.1 Autenticação")] }),
      bullet("Implementada com NextAuth.js v4 usando Credentials Provider"),
      bullet("Senhas armazenadas com hash bcryptjs (custo 12)"),
      bullet("Sessões via JWT assinado com NEXTAUTH_SECRET"),
      bullet("Middleware protege automaticamente /dashboard e /api/* relevantes"),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("7.2 Proteção do Callback n8n")] }),
      bullet("O endpoint /api/n8n é público mas protegido por secret token"),
      bullet("O n8n deve enviar o header: x-callback-secret com o valor configurado em N8N_CALLBACK_SECRET"),
      bullet("Se a variável não estiver definida no .env, o endpoint aceita qualquer chamada (modo desenvolvimento)"),
      bullet("Na VPS, N8N_CALLBACK_SECRET deve sempre estar configurado"),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("7.3 Perfis de Acesso (RBAC)")] }),
      p("A visibilidade dos campos é controlada no nível da API pela função selectPorRole() em lib/columns.ts, garantindo que dados sensíveis nunca sejam enviados ao frontend de usuários sem permissão."),
      space(80, 80),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [4160, 1700, 1800, 1700],
        rows: [
          new TableRow({ children: [
            hCell("Campo", 4160), hCell("ADMIN", 1700), hCell("OPERADOR", 1800), hCell("PRODUTOR", 1700),
          ]}),
          ...([
            ["Nome, Telefone, Email",         "✓", "✓", "✓"],
            ["Plano, Status",                 "✓", "✓", "✓"],
            ["Estilo, Letra",                 "✓", "✓", "✓"],
            ["Links (página, áudio, mp4)",    "✓", "✓", "✓"],
            ["Gerou Música, Entregas",        "✓", "✓", "—"],
            ["Song ID, Data Entrega",         "✓", "✓", "—"],
            ["Valor Pago",                    "✓", "—", "—"],
            ["UTMs, fbclid, IP",              "✓", "—", "—"],
            ["Data do Pedido",                "✓", "—", "—"],
          ].map(([campo, adm, op, prod], i) => new TableRow({ children: [
            cell(campo, { width: 4160, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(adm,  { width: 1700, align: AlignmentType.CENTER, bold: true,
              color: adm  === "✓" ? COR_PRIMARY : "AAAAAA", bg: i % 2 ? COR_ALT_ROW : null }),
            cell(op,   { width: 1800, align: AlignmentType.CENTER, bold: true,
              color: op   === "✓" ? COR_PRIMARY : "AAAAAA", bg: i % 2 ? COR_ALT_ROW : null }),
            cell(prod, { width: 1700, align: AlignmentType.CENTER, bold: true,
              color: prod === "✓" ? COR_PRIMARY : "AAAAAA", bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════════════════
      // 8. VARIÁVEIS DE AMBIENTE
      // ══════════════════════════════════════════════════════════════════
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("8. Variáveis de Ambiente")] }),
      p("Armazenadas no arquivo .env na raiz do projeto. Nunca devem ser commitadas no Git."),
      space(80, 80),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [3200, 6160],
        rows: [
          new TableRow({ children: [hCell("Variável", 3200), hCell("Descrição", 6160)] }),
          ...([
            ["DATABASE_URL",          "String de conexão com o PostgreSQL (inclui usuário, senha, host, banco)"],
            ["NEXTAUTH_SECRET",       "Chave secreta para assinatura dos tokens JWT de sessão"],
            ["NEXTAUTH_URL",          "URL base do portal (http://localhost:3000 em dev; domínio real na VPS)"],
            ["N8N_WEBHOOK_URL",       "URL do webhook do n8n que recebe o disparo de produção"],
            ["N8N_CALLBACK_SECRET",   "Senha secreta compartilhada entre o portal e o n8n para autenticar callbacks"],
          ].map(([a, b], i) => new TableRow({ children: [
            cell(a, { width: 3200, bold: true, color: COR_PRIMARY, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(b, { width: 6160, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),

      space(),
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [run("9. Deploy na VPS")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("9.1 Requisitos de Infraestrutura")] }),
      bullet("Node.js 18+"),
      bullet("PostgreSQL 17"),
      bullet("PM2 (gerenciador de processos)"),
      bullet("Git"),
      bullet("Domínio ou IP público acessível pelo Netlify e n8n"),
      space(),

      new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [run("9.2 Checklist de Deploy")] }),
      new Table({
        width: { size: W_FULL, type: WidthType.DXA },
        columnWidths: [800, 8560],
        rows: [
          new TableRow({ children: [hCell("", 800), hCell("Passo", 8560)] }),
          ...([
            ["☐", "Clonar repositório na VPS: git clone <repo>"],
            ["☐", "Criar arquivo .env com todas as variáveis (trocar NEXTAUTH_URL para domínio real)"],
            ["☐", "Instalar dependências: npm install"],
            ["☐", "Criar banco PostgreSQL na VPS"],
            ["☐", "Executar migrations: npm run db:push"],
            ["☐", "Importar histórico do Sheets (opcional): node scripts/import-xlsx.js"],
            ["☐", "Criar usuário admin: node scripts/criar-usuario.js"],
            ["☐", "Build de produção: npm run build"],
            ["☐", "Iniciar com PM2: pm2 start npm --name 'abc-music' -- start"],
            ["☐", "Configurar PM2 para reiniciar com o servidor: pm2 save && pm2 startup"],
            ["☐", "Atualizar URL no Netlify (checkout → /api/checkout do novo servidor)"],
            ["☐", "Atualizar nós HTTP do n8n com a URL real e o N8N_CALLBACK_SECRET"],
            ["☐", "Validar fluxo completo com pedido de teste"],
          ].map(([check, passo], i) => new TableRow({ children: [
            cell(check, { width: 800,  align: AlignmentType.CENTER, bg: i % 2 ? COR_ALT_ROW : null }),
            cell(passo, { width: 8560, bg: i % 2 ? COR_ALT_ROW : null }),
          ]}))),
        ],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  const out = "C:/Users/julia/OneDrive/Documentos/CLAUDE/abc-music-admin/abcMusic-SDD.docx";
  fs.writeFileSync(out, buffer);
  console.log("✓ Documento gerado:", out);
});
