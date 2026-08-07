// Monta a tabela local de endereços por DDD — roda UMA VEZ, precisa de internet.
//
//   node scripts/gerar-tabela-ddd-cep.js              → todos os 67 DDDs
//   node scripts/gerar-tabela-ddd-cep.js 47 11        → só esses
//   node scripts/gerar-tabela-ddd-cep.js --alvo=50    → meta fixa, ignora a tabela (teste)
//   node scripts/gerar-tabela-ddd-cep.js --forcar     → refaz DDDs já prontos
//
// Saída: lib/ceps/{ddd}.json, um arquivo por DDD, com a quantidade de endereços
// definida em ALVOS — proporcional à população da região. 67.000 no total.
// Depois disso o gerador de lote nunca mais consulta a rede.
//
// Retomável: cada DDD é gravado assim que fecha, e uma nova execução pula os
// arquivos que já existem. Pode interromper com Ctrl+C e continuar depois.

const fs = require("fs");
const path = require("path");
const { DIR_CEPS, DDDS_VALIDOS } = require("../lib/spedy");

// Meta de endereços por DDD, proporcional à população da área de cobertura.
// Total: 67.000 endereços em 67 DDDs. Fonte: cep_por_ddd.csv.
// DDD com mais clientes ganha mais variedade; região pequena não desperdiça raspagem.
const ALVOS = {
  11: 7346,  // SP — Grande Sao Paulo, Jundiai, Braganca Paulista
  12:  860,  // SP — Vale do Paraiba, S.J. dos Campos, Litoral Norte
  13:  629,  // SP — Baixada Santista, Registro
  14:  761,  // SP — Bauru, Marilia, Botucatu, Ourinhos
  15:  893,  // SP — Sorocaba, Itapetininga, Itapeva
  16: 1191,  // SP — Ribeirao Preto, Franca, Araraquara, S. Carlos
  17:  695,  // SP — S.J. do Rio Preto, Barretos, Catanduva
  18:  629,  // SP — Pres. Prudente, Aracatuba, Assis
  19: 1588,  // SP — Campinas, Piracicaba, Limeira, Rio Claro
  21: 4004,  // RJ — Regiao Metropolitana do Rio de Janeiro
  22:  761,  // RJ — Campos, Macae, Cabo Frio, Nova Friburgo
  24:  562,  // RJ — Volta Redonda, Petropolis, Teresopolis, Angra
  27:  993,  // ES — Grande Vitoria, Linhares, Sao Mateus, Colatina
  28:  275,  // ES — Cachoeiro de Itapemirim e sul do ES
  31: 2978,  // MG — RM Belo Horizonte, Vale do Aco, Sete Lagoas
  32:  562,  // MG — Juiz de Fora, Barbacena, S.J. del-Rei, Uba
  33:  529,  // MG — Gov. Valadares, Teofilo Otoni, Caratinga
  34:  794,  // MG — Uberlandia, Uberaba, Patos de Minas, Ituiutaba
  35:  893,  // MG — Pocos de Caldas, Varginha, Pouso Alegre, Lavras
  37:  364,  // MG — Divinopolis, Formiga, Para de Minas
  38:  629,  // MG — Montes Claros, Diamantina, Januaria, Unai
  41: 1489,  // PR — Curitiba, RM e Litoral
  42:  397,  // PR — Ponta Grossa, Guarapuava, Telemaco Borba
  43:  596,  // PR — Londrina, Apucarana, Cornelio Procopio
  44:  629,  // PR — Maringa, Campo Mourao, Umuarama, Paranavai
  45:  496,  // PR — Cascavel, Foz do Iguacu, Toledo
  46:  198,  // PR — Francisco Beltrao, Pato Branco
  47: 1059,  // SC — Joinville, Blumenau, Itajai, Bal. Camboriu
  48:  860,  // SC — Florianopolis, Criciuma, Tubarao
  49:  596,  // SC — Chapeco, Lages, Joacaba, Concordia
  51: 1787,  // RS — Porto Alegre, RM e Litoral Norte
  53:  364,  // RS — Pelotas, Rio Grande, Bage
  54:  794,  // RS — Caxias do Sul, Passo Fundo, Bento Goncalves
  55:  662,  // RS — Santa Maria, Uruguaiana, Ijui, Santa Rosa
  61: 1324,  // DF/GO — Distrito Federal e Entorno
  62: 1390,  // GO — Goiania, Anapolis e centro de Goias
  63:  500,  // TO — Todo o Tocantins
  64:  496,  // GO — Rio Verde, Itumbiara, Catalao, Jatai
  65:  662,  // MT — Cuiaba, Varzea Grande, Caceres, Barra do Garcas
  66:  546,  // MT — Rondonopolis, Sinop, Sorriso, Alta Floresta
  67:  913,  // MS — Todo o Mato Grosso do Sul
  68:  275,  // AC — Todo o Acre
  69:  523,  // RO — Toda a Rondonia
  71: 1588,  // BA — Salvador e Regiao Metropolitana
  73:  827,  // BA — Ilheus, Itabuna, Porto Seguro, Teixeira de Freitas
  74:  397,  // BA — Juazeiro, Irece, Jacobina
  75:  993,  // BA — Feira de Santana, Alagoinhas, S.A. de Jesus
  77:  860,  // BA — Vitoria da Conquista, Barreiras, Guanambi
  79:  731,  // SE — Todo o Sergipe
  81: 2416,  // PE — Recife, RM, Zona da Mata e Caruaru
  82: 1036,  // AL — Todo o Alagoas
  83: 1314,  // PB — Toda a Paraiba
  84: 1092,  // RN — Todo o Rio Grande do Norte
  85: 1853,  // CE — Fortaleza, RM e litoral
  86:  629,  // PI — Teresina, Parnaiba, Campo Maior
  87:  579,  // PE — Petrolina, Serra Talhada, Salgueiro, Arcoverde
  88: 1059,  // CE — Sobral, Juazeiro do Norte, Crato, Iguatu
  89:  453,  // PI — Picos, Floriano, Corrente
  91: 1456,  // PA — Belem, RM, Castanhal, Braganca, Marajo
  92: 1092,  // AM — Manaus, Itacoatiara, Parintins
  93:  463,  // PA — Santarem, Altamira, Itaituba
  94:  761,  // PA — Maraba, Parauapebas, Redencao, Tucurui
  95:  212,  // RR — Todo o Roraima
  96:  242,  // AP — Todo o Amapa
  97:  212,  // AM — Tefe, Tabatinga, Humaita, Coari
  98: 1456,  // MA — Sao Luis, Caxias, Bacabal, Codo
  99:  787,  // MA — Imperatriz, Acailandia, Balsas, Barra do Corda
};

// A lista autoritativa mora em lib/spedy.js — ALVOS aqui só define a meta de cada um.
const DDDS = [...DDDS_VALIDOS].map(Number).sort((a, b) => a - b);

// UF de cada DDD (coluna UF de cep_por_ddd.csv). Existe porque o `state` da
// BrasilAPI não é confiável — ver o comentário em coletarDDD(). O 61 tem duas
// porque o Entorno do DF fica em Goiás.
const UFS = {
  11: ["SP"], 12: ["SP"], 13: ["SP"], 14: ["SP"], 15: ["SP"], 16: ["SP"],
  17: ["SP"], 18: ["SP"], 19: ["SP"],
  21: ["RJ"], 22: ["RJ"], 24: ["RJ"],
  27: ["ES"], 28: ["ES"],
  31: ["MG"], 32: ["MG"], 33: ["MG"], 34: ["MG"], 35: ["MG"], 37: ["MG"], 38: ["MG"],
  41: ["PR"], 42: ["PR"], 43: ["PR"], 44: ["PR"], 45: ["PR"], 46: ["PR"],
  47: ["SC"], 48: ["SC"], 49: ["SC"],
  51: ["RS"], 53: ["RS"], 54: ["RS"], 55: ["RS"],
  61: ["DF", "GO"], 62: ["GO"], 64: ["GO"],
  63: ["TO"], 65: ["MT"], 66: ["MT"], 67: ["MS"], 68: ["AC"], 69: ["RO"],
  71: ["BA"], 73: ["BA"], 74: ["BA"], 75: ["BA"], 77: ["BA"],
  79: ["SE"], 81: ["PE"], 87: ["PE"], 82: ["AL"], 83: ["PB"], 84: ["RN"],
  85: ["CE"], 88: ["CE"], 86: ["PI"], 89: ["PI"],
  91: ["PA"], 93: ["PA"], 94: ["PA"], 92: ["AM"], 97: ["AM"],
  95: ["RR"], 96: ["AP"], 98: ["MA"], 99: ["MA"],
};

// Palavras comuns em nome de rua. Cada combinação cidade × termo rende até 50
// endereços (limite da ViaCEP), então a variedade de termos é o que enche a lista.
const TERMOS = [
  "Rua", "Avenida", "Travessa", "Brasil", "São", "Santa", "Santo", "Nova",
  "Sete", "Quinze", "Dom", "Padre", "Presidente", "Marechal", "Coronel",
  "Doutor", "General", "Almirante", "Tiradentes", "Duque", "Independência",
  "Liberdade", "Progresso", "Industrial", "Central", "Alegre", "Bela", "Boa",
  "Nossa Senhora", "João", "José", "Maria", "Antônio", "Francisco", "Pedro",
  "Paulo", "Flores", "Palmeiras", "Paraná", "Bahia", "Minas", "Amazonas",
  "Rio", "Campo", "Monte", "Vale", "Jardim", "Parque",
];

const PAUSA_MS = 300;          // cortesia com a ViaCEP — sem isso o IP é bloqueado
const TENTATIVAS = 4;

const args = process.argv.slice(2);
const forcar = args.includes("--forcar");
const alvoArg = args.find((a) => a.startsWith("--alvo="));
const ALVO_FIXO = alvoArg ? Number(alvoArg.split("=")[1]) : null;
const dddsPedidos = args.filter((a) => /^\d{2}$/.test(a));
// DDD que não existe não gera requisição — evita gastar raspagem com telefone errado.
const invalidos = dddsPedidos.filter((d) => !DDDS_VALIDOS.has(d));
if (invalidos.length) {
  console.error(`DDD inexistente: ${invalidos.join(", ")}. Válidos são os 67 em uso no Brasil.`);
  process.exit(1);
}
const alvoDDDs = dddsPedidos.length ? dddsPedidos.map(Number) : DDDS;

/** Meta do DDD: --alvo= sobrepõe tudo; senão a tabela proporcional; 500 como piso. */
function alvoDe(ddd) {
  return ALVO_FIXO || ALVOS[ddd] || 500;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET com repetição e recuo progressivo. Devolve null quando não há resultado útil. */
async function buscar(url) {
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "abc-music-admin/1.0" } });
      if (res.status === 404 || res.status === 400) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      if (t === TENTATIVAS) {
        console.log(`    ! falhou (${e.message}): ${url}`);
        return null;
      }
      await dormir(PAUSA_MS * 4 * t);
    }
  }
  return null;
}

/** Endereços da ViaCEP para uma cidade + termo, já filtrados e normalizados. */
async function enderecosDe(uf, cidade, termo, ddd) {
  const url = `https://viacep.com.br/ws/${uf}/${encodeURIComponent(cidade)}/${encodeURIComponent(termo)}/json/`;
  const dados = await buscar(url);
  await dormir(PAUSA_MS);
  if (!Array.isArray(dados)) return [];

  return dados
    // `unidade` preenchida = CEP de agência/caixa postal, não serve como endereço residencial.
    // O `ddd` devolvido pela própria ViaCEP é a validação de que o endereço é da região certa.
    .filter((r) => r && r.logradouro && !r.unidade && r.ibge && String(r.ddd) === String(ddd))
    .map((r) => ({
      cep: r.cep,
      logradouro: r.logradouro,
      bairro: r.bairro || "Centro",
      cidade: r.localidade,
      uf: r.uf,
      ibge: r.ibge,
    }));
}

async function coletarDDD(ddd, alvo) {
  const dd = String(ddd).padStart(2, "0");
  const info = await buscar(`https://brasilapi.com.br/api/ddd/v1/${dd}`);
  await dormir(PAUSA_MS);
  if (!info || !info.state || !Array.isArray(info.cities) || !info.cities.length) {
    console.log(`  DDD ${dd}: não consegui a lista de cidades`);
    return [];
  }

  // A BrasilAPI devolve UM `state` por DDD, derivado de alguma cidade da lista, e
  // erra em DDD de divisa ou que cruza estado:
  //   DDD 42 -> diz "SC" porque a primeira cidade é Porto União; o DDD é do PR
  //   DDD 61 -> diz "DF", mas 12 das 13 cidades são de Goiás
  // Por isso testamos as UFs conhecidas do DDD junto com a que ela informou, e
  // guardamos qual funcionou para cada cidade.
  const candidatas = [...new Set([...(UFS[ddd] || []), info.state])];
  const porCep = new Map();

  // Sondagem: 1 consulta por cidade para descobrir quais são grandes. Cidade que
  // devolve 50 (o teto da ViaCEP) tem muito mais endereços a extrair.
  const sondagem = [];
  for (const cidade of info.cities) {
    for (const uf of candidatas) {
      const achados = await enderecosDe(uf, cidade, "Rua", ddd);
      if (achados.length) {
        achados.forEach((e) => porCep.set(e.cep, e));
        sondagem.push({ cidade, uf, peso: achados.length });
        break; // achou a UF certa desta cidade; não testa as outras
      }
    }
    if (porCep.size >= alvo) break;
  }
  sondagem.sort((a, b) => b.peso - a.peso);
  const produtivas = sondagem.filter((c) => c.peso > 0);

  // Varredura profunda em rodadas: um termo por vez, passando por TODAS as cidades
  // antes de repetir termo. Se esgotássemos cidade por cidade, a maior sozinha
  // atingiria a meta e as outras nunca seriam consultadas — o DDD 47 sairia com
  // 1.059 endereços só de Joinville, e um cliente de Blumenau receberia um deles.
  //
  // As cidades grandes ainda ficam mais representadas naturalmente: as pequenas
  // secam depois de uma ou duas rodadas e passam a devolver só CEP repetido.
  for (const termo of TERMOS) {
    if (porCep.size >= alvo) break;
    if (termo === "Rua") continue; // já usado na sondagem
    for (const { cidade, uf } of produtivas) {
      if (porCep.size >= alvo) break;
      const achados = await enderecosDe(uf, cidade, termo, ddd);
      achados.forEach((e) => porCep.set(e.cep, e));
    }
  }

  return [...porCep.values()].slice(0, alvo);
}

async function main() {
  fs.mkdirSync(DIR_CEPS, { recursive: true });
  const metaTotal = alvoDDDs.reduce((s, d) => s + alvoDe(d), 0);
  console.log(`${alvoDDDs.length} DDD(s) · meta total ${metaTotal.toLocaleString("pt-BR")} endereços`);
  console.log(ALVO_FIXO ? `Meta fixa: ${ALVO_FIXO} por DDD\n` : "Meta proporcional à população de cada DDD\n");

  const resumo = [];
  for (const ddd of alvoDDDs) {
    const dd = String(ddd).padStart(2, "0");
    const alvo = alvoDe(ddd);
    const arquivo = path.join(DIR_CEPS, `${dd}.json`);

    if (fs.existsSync(arquivo) && !forcar) {
      const n = JSON.parse(fs.readFileSync(arquivo, "utf8")).length;
      console.log(`DDD ${dd}: já existe (${n}) — pulando`);
      resumo.push({ ddd: dd, n, alvo });
      continue;
    }

    process.stdout.write(`DDD ${dd}: coletando (meta ${alvo})... `);
    const lista = await coletarDDD(ddd, alvo);
    if (!lista.length) {
      console.log("nada encontrado");
      resumo.push({ ddd: dd, n: 0, alvo });
      continue;
    }
    // Sem indentação: são ~67 mil endereços no total e ninguém abre esses arquivos
    // à mão. A formatação custaria 1,8 MB só em espaços e quebras de linha.
    fs.writeFileSync(arquivo, JSON.stringify(lista));
    const cidades = new Set(lista.map((e) => e.cidade)).size;
    console.log(`${lista.length}/${alvo} em ${cidades} cidade(s) → lib/ceps/${dd}.json`);
    resumo.push({ ddd: dd, n: lista.length, alvo, cidades });
  }

  const total = resumo.reduce((s, r) => s + r.n, 0);
  const fracos = resumo.filter((r) => r.n < r.alvo);
  console.log(`\n${resumo.filter((r) => r.n > 0).length}/${alvoDDDs.length} DDDs com tabela · ${total.toLocaleString("pt-BR")} endereços no total.`);
  if (fracos.length) {
    console.log("\nAbaixo da meta (funcionam mesmo assim, só com menos variedade):");
    for (const r of fracos) console.log(`  DDD ${r.ddd}: ${r.n}/${r.alvo}`);
  }
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exitCode = 1;
});
