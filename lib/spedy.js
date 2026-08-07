// Tradução de Pedido → planilha de importação de vendas da Spedy (NF-e).
//
// Layout conforme https://ajuda.spedy.com.br/pt-br/article/importacao-de-vendas-via-planilha-1ixmk29/
// e a aba "Modelo" de importacao-vendas-spedy.xlsx.
//
// Só define funções — quem executa são os scripts em scripts/.

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Ordem exata das 30 colunas da planilha modelo. Ordem errada = importação recusada.
const COLUNAS = [
  "Venda_codigo",
  "Venda_data",
  "Venda_dataaprovacao",
  "Venda_valortotal",
  "Venda_formapagamento",
  "Venda_status",
  "Venda_enviaremail",
  "Venda_perfil",
  "Venda_transmitirnota",
  "Venda_datagarantia",
  "Venda_produtocod",
  "Venda_produtodescricao",
  "descricao_nf",
  "modelo_nf",
  "Cliente_cpfcnpj",
  "Cliente_nome",
  "Cliente_razaosocial",
  "Cliente_inscricaoestadual",
  "Cliente_email",
  "Cliente_telefone",
  "Cliente_celular",
  "Cliente_inscricaomunicipal",
  "Cliente_endereco_logradouro",
  "Cliente_endereco_numero",
  "Cliente_endereco_bairro",
  "Cliente_endereco_complemento",
  "Cliente_endereco_cep",
  "Cliente_endereco_pais",
  "Cliente_endereco_cidade",
  "Cliente_endereco_estado",
];

const PADROES = {
  formaPagamento: "PIX",        // checkout é PIX via AbacatePay
  status: "Aprovado",           // só exportamos pedidos já pagos
  enviarEmail: "Sim",
  perfil: "Produtor",
  transmitirNota: "Manualmente", // entra na Spedy sem transmitir — dá espaço para conferir
  modeloNf: "nfe",
  pais: "Brasil",
  numeroEndereco: "S/N",
};

// A tributação (NCM, CFOP, unidade) vem da configuração global de NF-e na Spedy e
// vale para todas as vendas — os planos não precisam de cadastro individual de
// produto. Por isso plano novo não exige alteração aqui: basta existir no banco.
const NOME_PLANO = { basic: "Básico", silver: "Silver", bump: "Bump", gold: "Gold" };

const DIR_CEPS = path.join(__dirname, "ceps");

/**
 * Pasta onde os lotes gerados são gravados. Configurável por SPEDY_EXPORTS_DIR no
 * .env — útil para manter os arquivos fora do repositório do portal. Sem a variável,
 * usa <projeto>/exports.
 *
 * É função e não constante porque precisa ser lida depois do dotenv.config().
 */
function dirExports() {
  return process.env.SPEDY_EXPORTS_DIR || path.join(__dirname, "..", "exports");
}

/**
 * Mês de alocação do lote, no formato MM.AA: "2026-07-31" -> "07.26".
 * Sai do rótulo, que é a data de fechamento da competência. Rótulo sem data
 * reconhecível cai em "sem-data" em vez de espalhar arquivo pela raiz.
 */
function mesDoLote(lote) {
  const m = /^(\d{4})-(\d{2})/.exec(String(lote));
  return m ? `${m[2]}.${m[1].slice(2)}` : "sem-data";
}

/**
 * Pasta de um lote: <exports>/07.26/2026-07-31.
 *
 * Dois níveis: o mês agrupa a competência (um mês pode ter vários lotes, se você
 * fatiar por semana ou refizer um), e a pasta do lote isola cada remessa. Sem
 * isso a raiz acumularia três arquivos por lote e ficaria ilegível em um ano.
 *
 * Os arquivos dentro mantêm o rótulo no nome mesmo sendo redundante com a pasta —
 * assim um .xlsx baixado ou anexado num e-mail continua identificável.
 */
function dirLote(lote) {
  return path.join(dirExports(), mesDoLote(lote), lote);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Remove acentos e qualquer caractere fora do ASCII imprimível.
 * "João Conceição" -> "Joao Conceicao"
 *
 * Exigência do contador para os campos de texto da NF-e. O NFD separa a letra do
 * acento e o replace descarta os acentos; o segundo replace pega o que sobrar
 * (º, ª, emoji, aspas tipográficas).
 *
 * NÃO é aplicado em Cliente_endereco_cidade: o nome do município é chave de
 * busca na Spedy, e "Sao Paulo" pode não casar com o cadastro do IBGE.
 */
function semAcento(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nome do destinatário pronto para a NF-e.
 *
 * Alguns nomes chegaram do checkout com URL-encoding cru — "Luis%20Gustavo%20
 * Rodrigues%20de%20Fran%C3%A7a" — e iriam para a nota com os %20 literais.
 * Decodifica antes de tirar os acentos. Se a decodificação falhar (um "%" solto
 * no meio do nome), mantém o original em vez de perder o dado.
 */
function limparNome(v) {
  let s = String(v || "");
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try { s = decodeURIComponent(s.replace(/\+/g, " ")); } catch { /* mantém o original */ }
  }
  return semAcento(s);
}

function somenteDigitos(v) {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Telefone normalizado: só dígitos, sem o zero da operadora e sem o 55 do país.
 *
 * A base tem os três formatos: "11987654321", "5511987654321" e "011987654321".
 * O zero da frente é prefixo de seleção de operadora, não faz parte do número —
 * sem removê-lo, o DDD 11 era lido como "01". Isso afetava 176 pedidos de julho.
 */
function normalizarTelefone(v) {
  let d = somenteDigitos(v).replace(/^0+/, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.replace(/^0+/, "");
}

function dddDe(telefone) {
  const d = normalizarTelefone(telefone);
  return d.length >= 10 ? d.slice(0, 2) : null;
}

// Os 67 DDDs em uso no Brasil. Serve para distinguir "DDD que ainda não raspei"
// de "DDD que não existe" — o primeiro se resolve com a raspagem, o segundo é
// telefone errado no cadastro e precisa de correção no portal.
const DDDS_VALIDOS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/** Valida CPF pelos dois dígitos verificadores. */
function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}

function formatarCpf(v) {
  const d = somenteDigitos(v);
  if (d.length !== 11) return String(v || "");
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatarTelefone(v) {
  const d = normalizarTelefone(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return d;
}

/**
 * Data no fuso de São Paulo. As datas no banco são instantes UTC; sem o ajuste,
 * um pedido das 22h do dia 31 sairia com a data do dia 1º do mês seguinte.
 */
function dataBR(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
}

/** Data de hoje em São Paulo no formato YYYY-MM-DD — usada como rótulo de lote. */
function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Instante UTC correspondente à meia-noite de "YYYY-MM-DD" em São Paulo (UTC-3). */
function inicioDoDiaBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Data inválida: "${iso}". Use YYYY-MM-DD.`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 3, 0, 0));
}

// ─── Endereço a partir do DDD ───────────────────────────────────────────────

const cacheCeps = new Map();

/** Carrega lib/ceps/{ddd}.json uma vez por execução. Devolve null se não existir. */
function listaDeCeps(ddd) {
  if (cacheCeps.has(ddd)) return cacheCeps.get(ddd);
  const arquivo = path.join(DIR_CEPS, `${ddd}.json`);
  let lista = null;
  if (fs.existsSync(arquivo)) {
    const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    if (Array.isArray(dados) && dados.length) lista = dados;
  }
  cacheCeps.set(ddd, lista);
  return lista;
}

/** DDD confiável do pedido, ou null se o telefone veio truncado/inválido. */
function dddDoPedido(pedido) {
  const d = dddDe(pedido.telefone);
  return d && DDDS_VALIDOS.has(d) ? d : null;
}

let dddsComTabela = null;

/** DDDs que têm arquivo em lib/ceps/. Calculado uma vez por execução. */
function dddsDisponiveis() {
  if (!dddsComTabela) dddsComTabela = [...DDDS_VALIDOS].filter((d) => listaDeCeps(d));
  return dddsComTabela;
}

/**
 * Sorteia um endereço para o destinatário.
 *
 * Com telefone válido, sorteia dentro do DDD do cliente — o endereço não é o dele,
 * mas ao menos é da região. Sem telefone utilizável (55 pedidos de julho chegaram
 * com só o DDD ou menos, truncados já no checkout), sorteia o DDD também: um
 * telefone quebrado não pode bloquear a emissão, e o celular não é obrigatório na
 * NF-e. Nesses casos `Cliente_celular` sai vazio em vez de sair pela metade.
 */
function enderecoPara(pedido) {
  const ddd = dddDoPedido(pedido) || dddsDisponiveis()[Math.floor(Math.random() * dddsDisponiveis().length)];
  const lista = ddd && listaDeCeps(ddd);
  if (!lista) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}

// ─── Validação ──────────────────────────────────────────────────────────────

/** Campos do Pedido que os scripts precisam buscar. */
const SELECT_PEDIDO = {
  id: true,
  nome: true,
  nomefiscal: true,
  cpf: true,
  email: true,
  telefone: true,
  plano: true,
  valor: true,
  data_pedido: true,
  criado_em: true,
};

/** Motivos que impedem o pedido de virar nota. Lista vazia = apto. */
function validar(pedido) {
  const erros = [];

  const doc = somenteDigitos(pedido.cpf);
  if (!doc) erros.push("CPF ausente");
  else if (doc === "00000000000") erros.push("CPF é o valor padrão (00000000000)");
  else if (doc.length !== 11) erros.push(`CPF com ${doc.length} dígitos`);
  else if (!cpfValido(doc)) erros.push("CPF com dígito verificador inválido");

  const valor = pedido.valor == null ? null : Number(pedido.valor);
  if (valor == null) erros.push("valor ausente");
  else if (!(valor > 0)) erros.push("valor zerado ou negativo");

  // Só `nomefiscal` serve como destinatário. O campo `nome` é o homenageado da
  // música, não quem pagou — cruzando 523 pedidos com o extrato do AbacatePay,
  // `nomefiscal` bateu com o pagador em 97,6% e `nome` em 8,8%. Um fallback para
  // `nome` colocaria a pessoa errada na nota, em silêncio.
  //
  // Nome de uma palavra só é aceito: muita gente informa só o primeiro nome, e
  // isso não impede a emissão.
  if (!limparNome(pedido.nomefiscal)) erros.push("nome fiscal ausente");

  // Telefone NÃO bloqueia: é opcional na NF-e, e quando está truncado o endereço
  // passa a ser sorteado entre todos os DDDs (ver enderecoPara). Só falta de
  // tabela é problema, e aí nenhum pedido sai — é a raspagem que não rodou.
  const ddd = dddDoPedido(pedido);
  if (ddd && !listaDeCeps(ddd)) {
    erros.push(`sem tabela de endereços para o DDD ${ddd} — rodar spedy:ceps`);
  } else if (!dddsDisponiveis().length) {
    erros.push("nenhuma tabela de endereços — rodar spedy:ceps");
  }

  if (!(pedido.data_pedido || pedido.criado_em)) erros.push("sem data do pedido");

  return erros;
}

// ─── Montagem da linha ──────────────────────────────────────────────────────

// Sem hífen e sem acento, por exigência do contador.
function descricaoProduto(plano) {
  const nome = NOME_PLANO[String(plano || "").toLowerCase()] || plano;
  return semAcento(nome ? `Musica personalizada plano ${nome}` : "Musica personalizada");
}

/** Converte um Pedido válido na linha de 30 colunas. */
function montarLinha(pedido) {
  const data = dataBR(pedido.data_pedido || pedido.criado_em);
  const end = enderecoPara(pedido);

  const linha = {
    Venda_codigo: pedido.id,
    Venda_data: data,
    Venda_dataaprovacao: data,
    Venda_valortotal: Number(pedido.valor).toFixed(2),
    Venda_formapagamento: PADROES.formaPagamento,
    Venda_status: PADROES.status,
    Venda_enviaremail: PADROES.enviarEmail,
    Venda_perfil: PADROES.perfil,
    Venda_transmitirnota: PADROES.transmitirNota,
    Venda_produtocod: String(pedido.plano || "").toLowerCase(),
    Venda_produtodescricao: descricaoProduto(pedido.plano),
    modelo_nf: PADROES.modeloNf,
    Cliente_cpfcnpj: formatarCpf(pedido.cpf),
    Cliente_nome: limparNome(pedido.nomefiscal),
    Cliente_email: pedido.email || "",
    Cliente_celular: dddDoPedido(pedido) ? formatarTelefone(pedido.telefone) : "",
    Cliente_endereco_logradouro: semAcento(end.logradouro),
    Cliente_endereco_numero: PADROES.numeroEndereco,
    Cliente_endereco_bairro: semAcento(end.bairro),
    Cliente_endereco_cep: end.cep,
    Cliente_endereco_pais: PADROES.pais,
    Cliente_endereco_cidade: end.cidade,
    Cliente_endereco_estado: end.uf,
  };

  // Colunas de PJ e demais não usadas entram vazias, preservando a ordem do modelo.
  for (const c of COLUNAS) if (!(c in linha)) linha[c] = "";
  return linha;
}

/** Separa os pedidos em aptos (linhas prontas) e pendentes (com o motivo). */
function processar(pedidos) {
  const aptos = [];
  const pendentes = [];
  for (const p of pedidos) {
    const erros = validar(p);
    if (erros.length) {
      // As três primeiras colunas depois da chave são as editáveis, e trazem o
      // valor CRU do banco — nada de fallback. Campo vazio significa "falta
      // preencher"; se viesse preenchido com o homenageado, uma correção manual
      // gravaria a pessoa errada como destinatário da nota.
      pendentes.push({
        Venda_codigo: p.id,
        Motivo: erros.join("; "),
        Cliente_nome: p.nomefiscal || "",
        Cliente_cpfcnpj: p.cpf === "00000000000" ? "" : (p.cpf || ""),
        Cliente_celular: p.telefone || "",
        ref_nome_pedido: p.nome || "",
        ref_data: dataBR(p.data_pedido || p.criado_em),
        ref_valor: p.valor == null ? "" : String(p.valor),
        ref_plano: p.plano || "",
        ref_email: p.email || "",
      });
    } else {
      aptos.push(montarLinha(p));
    }
  }
  return { aptos, pendentes };
}

// ─── Geração dos arquivos ───────────────────────────────────────────────────

function planilha(linhas, header, nomeAba, larguras) {
  const ws = XLSX.utils.json_to_sheet(linhas, { header });
  ws["!cols"] = larguras || header.map((c) => ({ wch: Math.max(14, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeAba);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/** .xlsx pronto para subir na Spedy. Aba única — ela lê a primeira. */
function planilhaVendas(linhas) {
  return planilha(linhas, COLUNAS, "Vendas");
}

// Colunas que o aplicar-correcoes-spedy.js lê de volta para o banco.
const COLUNAS_EDITAVEIS = {
  Cliente_nome: "nomefiscal",
  Cliente_cpfcnpj: "cpf",
  Cliente_celular: "telefone",
};

const COLUNAS_PENDENCIAS = [
  "Venda_codigo", "Motivo",
  ...Object.keys(COLUNAS_EDITAVEIS),
  "ref_nome_pedido", "ref_data", "ref_valor", "ref_plano", "ref_email",
];

/**
 * .xlsx dos pedidos bloqueados. É um formulário de ida e volta: você preenche as
 * três colunas editáveis e o aplicar-correcoes-spedy.js grava no banco.
 * As colunas `ref_*` são contexto para identificar o pedido — nunca são lidas.
 */
function planilhaPendencias(linhas) {
  const larguras = [
    { wch: 30 }, { wch: 52 },
    { wch: 28 }, { wch: 18 }, { wch: 16 },
    { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 30 },
  ];
  return planilha(linhas, COLUNAS_PENDENCIAS, "Pendências", larguras);
}

module.exports = {
  COLUNAS,
  PADROES,
  DDDS_VALIDOS,
  SELECT_PEDIDO,
  DIR_CEPS,
  dirExports,
  dirLote,
  mesDoLote,
  normalizarTelefone,
  dddDe,
  dddDoPedido,
  cpfValido,
  semAcento,
  limparNome,
  formatarCpf,
  formatarTelefone,
  dataBR,
  hojeISO,
  inicioDoDiaBR,
  listaDeCeps,
  enderecoPara,
  validar,
  montarLinha,
  processar,
  planilhaVendas,
  planilhaPendencias,
};
