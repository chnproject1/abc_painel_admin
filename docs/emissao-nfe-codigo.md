# Como o código funciona

Documentação técnica dos scripts de emissão de NF-e. Para **usar** o sistema, veja
[manual de operação](emissao-nfe-manual.md) — este arquivo é para entender ou alterar o código.

```
lib/spedy.js                        ← toda a lógica (não roda sozinho)
lib/ceps/{ddd}.json                 ← tabela de endereços, gerada uma vez
scripts/conciliar-extrato-spedy.js  ← confere o extrato do gateway
scripts/aplicar-correcoes-spedy.js  ← aplica as correções da planilha
scripts/gerar-tabela-ddd-cep.js     ← gera a tabela acima
scripts/marcar-historico-spedy.js   ← backfill, roda uma vez
scripts/gerar-lote-spedy.js         ← o comando semanal
scripts/marcar-lote-spedy.js        ← confirma o lote
```

---

# 1. `lib/spedy.js`

O coração do sistema. Só exporta funções — quem executa são os scripts. Fica em `lib/`
porque é biblioteca, seguindo o padrão de `lib/auth.ts`, `lib/prisma.ts` e `lib/columns.ts`.

## `COLUNAS` — [linha 13](../lib/spedy.js:13)

Array com as 30 colunas da planilha, na ordem exata da aba `Modelo` de
`importacao-vendas-spedy.xlsx`.

A ordem espelha o modelo baixado da Spedy, e as 30 continuam no arquivo mesmo com 7 sempre
vazias. É uma escolha conservadora: **não foi verificado se a Spedy casa as colunas pelo nome
do cabeçalho ou pela posição.** Se for por posição, remover ou reordenar desloca todo o resto
e os dados entram nos campos errados — CPF no campo de valor. Manter o layout idêntico
funciona nas duas hipóteses.

Este array é a única fonte da ordem: é usado tanto para montar a linha quanto para escrever
o cabeçalho, então os dois nunca divergem.

## `PADROES` e `STATUS_FATURAVEIS` — [linhas 46 e 57](../lib/spedy.js:57)

```js
const STATUS_FATURAVEIS = ["pago", "cancelado"];

const PADROES = {
  formaPagamento: "PIX",
  status: "Aprovado",
  enviarEmail: "Sim",
  perfil: "Produtor",
  transmitirNota: "Manualmente",
  modeloNf: "nfe",
  pais: "Brasil",
  numeroEndereco: "0",
  produtoCod: "S200",
  produtoDescricao: "SENTINDO O PODER DA MUSICA ISBN 9786502267752",
};
```

**`cancelado` está entre os faturáveis** porque o portal não tem cancelamento de verdade. O
único lugar do sistema que grava esse status é o botão "Contato inválido" em
`app/dashboard/pedido/[id]/page.tsx:127`, usado quando a música não pôde ser entregue — a
venda aconteceu e o dinheiro entrou. Sem isso, 19 vendas de julho ficariam sem nota.

Se um dia existir estorno, ele vai precisar de status próprio; reaproveitar `cancelado` faria
sair nota para venda desfeita.

`transmitirNota: "Manualmente"` é a outra decisão que importa: as vendas entram na Spedy mas
as notas **não são transmitidas sozinhas**, o que dá espaço para conferir antes.

O produto é único — mesmo código e mesma descrição para todos os planos, porque o que se
vende fiscalmente é um item só, cadastrado na Spedy com o ISBN.

## `MAX_TEXTO` e a limpeza de texto — [linha 79](../lib/spedy.js:79)

Quatro funções trabalham em sequência para deixar um texto pronto para a nota.

**`semAcento`** tira acento e troca qualquer caractere fora de `[A-Za-z0-9 ]` por **espaço**,
não por vazio: `Sao Jose-SP` precisa virar `Sao Jose SP` e não `Sao JoseSP`. Em julho havia
280 pares de parênteses, 202 hífens e 50 apóstrofos nos endereços.

**`cortarEmPalavra`** corta na última palavra que cabe inteira.

**`encurtarNome`** descarta os nomes do meio quando o texto estoura o limite:
`Moacir Ferreira e Neila Ap de Sa Ferreira` (41) vira `Moacir Ferreira`. Só serve para nome
de pessoa — em endereço o mesmo critério transformaria
`Avenida Vereador Francisco de Paula Gomes dos Santos` em `Avenida Santos`, que é outra rua.

**`limparTexto`** é o caminho do endereço: limpa e corta pelo começo, preservando o que
identifica a rua.

`MAX_TEXTO` é 40. A NF-e aceita 60; com 40, só 3 nomes dos 7.614 de julho foram abreviados —
o p99 é 29.

## `PREFIXOS_NOME` e `pareceNome()` — [linhas 184 e 209](../lib/spedy.js:184)

```js
const PALAVRAS_NAO_NOME = new Set([
  "musica", "amor", "quero", "chama", "chamo", "agente", "pra", "para",
  "nossa", "nosso", "meu", "minha", "sem", "feliz", "aniversario",
  "homenagem", "surpresa", "obrigada", "obrigado",
]);

function pareceNome(v) {
  const n = limparNome(v);
  if (!n) return false;
  return !n.toLowerCase().split(" ").some((w) => PALAVRAS_NAO_NOME.has(w));
}
```

O campo de nome fiscal recebe três coisas diferentes na prática, e cada uma tem tratamento.

**Nome com prefixo** — `Nome Alcir Vacht`, `Meu nome Moziel Cassiano`. O `PREFIXOS_NOME`
remove; ninguém se chama "Nome".

**Nome longo** — resolvido pelo `encurtarNome`.

**Recado** — `Quero deixar sem meu nome`, `Nossa musica e so pra contrariar o nome da
musica`. Vira pendência, para alguém preencher o nome real. Foram 3 em julho.

**É um `Set` comparado palavra a palavra, não um regex de busca.** A comparação exata é o que
impede `Maria das Dores de Amorim` de casar com "amor", `Sempre Silva` com "sem" e `Parana
Ribeiro` com "para". Uma versão anterior usava busca de substring e barrava os três.

## `dirExports()`, `mesDoLote()` e `dirLote()` — [linhas 90 a 96](../lib/spedy.js:90)

```js
function dirExports() {
  return process.env.SPEDY_EXPORTS_DIR || path.join(__dirname, "..", "exports");
}

function mesDoLote(lote) {
  const m = /^(\d{4})-(\d{2})/.exec(String(lote));
  return m ? `${m[2]}.${m[1].slice(2)}` : "sem-data";
}

function dirLote(lote) {
  return path.join(dirExports(), mesDoLote(lote), lote);
}
```

`dirExports` é **função e não constante** de propósito: os scripts chamam
`require("dotenv").config()` antes de importar este módulo, mas ler a variável na hora do uso
deixa o comportamento correto independente da ordem dos `require`.

`SPEDY_EXPORTS_DIR` permite tirar os arquivos gerados de dentro do repositório — eles têm CPF,
e-mail e telefone de cliente. Como o `.env` é por máquina, a VPS usa o padrão sem configuração.

`mesDoLote` extrai a competência do rótulo: `2026-07-31` → `07.26`. Sai do **rótulo**, não da
data de execução — um lote gerado em agosto com `--ate=2026-07-31` pertence a julho. O sufixo
de repetição não atrapalha, porque o regex não está ancorado no fim: `2026-07-31-b` também dá
`07.26`. Rótulo sem data reconhecível (`historico`) cai em `sem-data`, em vez de espalhar
arquivo pela raiz.

`dirLote` monta os dois níveis, `07.26/2026-07-31`. O mês agrupa a competência — um mês pode
ter vários lotes se você fatiar por semana ou refizer um — e a pasta do lote isola cada
remessa. Os arquivos dentro mantêm o rótulo no nome mesmo sendo redundante com a pasta: um
`.xlsx` baixado ou anexado num e-mail continua identificável fora do contexto da pasta.

## `normalizarTelefone()` — [linha 233](../lib/spedy.js:233)

```js
function normalizarTelefone(v) {
  let d = somenteDigitos(v).replace(/^0+/, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.replace(/^0+/, "");
}
```

Três formatos convivem na base: `11987654321`, `5511987654321` e `011987654321`.

O `replace(/^0+/, "")` na primeira linha é a correção de um bug real: o zero da frente é
prefixo de seleção de operadora, não faz parte do número. Sem removê-lo, `011987654321` era
lido como **DDD "01"** — e como não existe tabela de endereços para um DDD que não existe,
esses pedidos ficariam travados para sempre. Afetava 176 pedidos de julho, que apareciam como
os DDDs falsos `01` a `09`.

O corte do `55` só acontece com mais de 11 dígitos, senão um número de DDD 55 (Santa Maria)
seria mutilado. O segundo `replace` cobre `0055...`.

## `dddDe()` — [linha 239](../lib/spedy.js:239)

Os 2 primeiros dígitos do telefone normalizado, e só se sobrarem ao menos 10. Telefone curto
ou lixo devolve `null`.

## `DDDS_VALIDOS` — [linha 247](../lib/spedy.js:247)

Os 67 DDDs em uso no Brasil, como `Set`. Serve para distinguir dois problemas que exigem
ações opostas:

- `sem tabela de endereços para o DDD 11 — rodar spedy:ceps` → resolve com a raspagem
- `DDD 23 não existe — corrigir o telefone` → raspar nunca resolveria; o cadastro está errado

Sem essa distinção, a mensagem seria "sem tabela para o DDD 23" e apontaria para a solução
errada. É também a lista autoritativa usada por `gerar-tabela-ddd-cep.js`.

## `formatarCpf()` e `formatarCep()`

CPF em 11 dígitos corridos, CEP em 8, sem ponto nem traço. Os dois usam `padStart` com zero.

No CPF isso também **recupera o zero perdido**: um CPF que virou número em algum ponto do
caminho chega com 10 dígitos, e `"1234567890"` é na verdade `"01234567890"`. Como o dígito
verificador é conferido logo depois, uma restauração errada não passa despercebida.

Em julho, **2.675 CPFs e 645 CEPs começam com zero** — se saíssem como número na planilha,
todos perderiam o primeiro dígito. É por isso que as células do `.xlsx` precisam ser do tipo
texto, e há um teste que confere isso depois de gerar.

## `cpfValido()` — [linha 260](../lib/spedy.js:260)

Calcula os dois dígitos verificadores:

```js
for (let t = 9; t < 11; t++) {
  let soma = 0;
  for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
  if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
}
```

A primeira volta (`t = 9`) valida o 10º dígito usando os 9 primeiros; a segunda valida o 11º
usando os 10 primeiros. O `/^(\d)\1{10}$/` antes do laço rejeita `111.111.111-11` e afins,
que passam na conta mas não são CPFs reais.

A Spedy só descobre CPF inválido na hora de transmitir — depois de a venda já estar lançada.
Validar antes evita ficar com venda importada e nota travada.

## `dataBR()` — [linha 302](../lib/spedy.js:302)

```js
return new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
}).format(new Date(d));
```

O `timeZone` explícito não é detalhe. As datas no banco são instantes UTC (`data_pedido:
new Date()` em [app/api/checkout/route.ts:158](../app/api/checkout/route.ts:158)). Um pedido das
22h do dia 31 é o dia seguinte em UTC — sem o fuso, sairia com data `01/08` e cairia na
competência errada.

## `inicioDoDiaBR()` — [linha 323](../lib/spedy.js:323)

O caminho inverso: converte `"2026-07-01"` no instante UTC da meia-noite em São Paulo,
somando as 3 horas de diferença. É o que faz o corte do backfill cair exatamente na virada
do dia no Brasil.

## `listaDeCeps()` — [linha 334](../lib/spedy.js:334)

Lê `lib/ceps/{ddd}.json` e guarda num `Map`. O cache evita reler o arquivo a cada pedido: num
lote de 200 vendas do DDD 11, o `11.json` (7.346 endereços) é lido do disco **uma vez**, não
200. O `Map` guarda também o resultado negativo (`null`), então um DDD sem tabela não é
reprocurado.

## `dddDoPedido()` e `enderecoPara()`

```js
function enderecoPara(pedido) {
  const ddd = dddDoPedido(pedido) || dddsDisponiveis()[Math.floor(Math.random() * dddsDisponiveis().length)];
  const lista = ddd && listaDeCeps(ddd);
  if (!lista) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}
```

Com telefone válido, sorteia dentro do DDD do cliente — o endereço não é o dele, mas ao menos
é da região.

**Sem telefone utilizável, sorteia o DDD também.** 55 pedidos de julho chegaram com só o DDD
gravado ou menos, truncados já no checkout; o extrato do AbacatePay tinha o mesmo valor
quebrado, então não havia de onde recuperar. Como o celular é opcional na NF-e, um telefone
ruim não pode bloquear a emissão — nesses casos `Cliente_celular` sai **vazio** em vez de
sair pela metade, e o endereço vem de um DDD qualquer.

`dddsDisponiveis()` lista só os DDDs que têm arquivo em `lib/ceps/`, calculado uma vez por
execução.

## `validar()`

Devolve um array de motivos. Vazio = apto. Um pedido pode acumular vários:

| Checagem | Motivo |
|---|---|
| CPF vazio / `00000000000` / ≠ 11 dígitos / DV inválido | 4 mensagens distintas |
| `valor` nulo ou ≤ 0 | `valor ausente` / `valor zerado ou negativo` |
| `nomefiscal` vazio | `nome fiscal ausente` |
| `nomefiscal` com cara de recado | `nome fiscal não parece nome de pessoa ("...")` |
| DDD do pedido sem arquivo em `lib/ceps/` | `sem tabela de endereços para o DDD 11` |
| sem `data_pedido` nem `criado_em` | `sem data do pedido` |

Duas coisas que **não** bloqueiam, de propósito:

**Telefone.** É opcional na NF-e, e quando vem truncado o endereço passa a ser sorteado entre
todos os DDDs. Bloquear por isso deixaria 55 vendas de julho sem nota.

**Plano.** A tributação vem da configuração global da Spedy, e o produto é único (`S200`), então
o nome do plano não influencia a emissão.

O CPF é validado **depois** do `formatarCpf`, que restaura o zero à esquerda — um CPF que
perdeu o zero por ter virado número em algum ponto é conferido corretamente.

O nome usa só `nomefiscal`, nunca o `nome`: cruzando 523 pedidos com o extrato do AbacatePay,
`nomefiscal` bateu com o pagador em 97,6% e `nome` em 8,8%, porque `nome` é o homenageado da
música. Um fallback colocaria a pessoa errada na nota, em silêncio.

## `montarLinha()` — [linha 439](../lib/spedy.js:439)

Monta o objeto de 30 chaves. O truque está no final:

```js
for (const c of COLUNAS) if (!(c in linha)) linha[c] = "";
```

Em vez de escrever as 30 chaves à mão (metade vazias), preenche só as que têm conteúdo e
completa o resto varrendo `COLUNAS`. Se uma coluna for acrescentada no array, ela já sai vazia
na planilha em vez de sumir. `Cliente_razaosocial` e `Cliente_inscricaoestadual` caem nesse
preenchimento — todos os clientes são PF.

## `processar()` — [linha 475](../lib/spedy.js:475)

Roda `validar()` em cada pedido e separa em dois baldes. Quem passa vira linha da planilha;
quem não passa vira linha da planilha de pendências, com `Motivo` sendo os erros unidos por
`; `. É a única função que os scripts chamam para transformar dados em planilha.

## Geração dos arquivos — [linhas 323 a 347](../lib/spedy.js:323)

`planilha()` faz o trabalho com o SheetJS (o pacote `xlsx`, já dependência do projeto):

```js
const ws = XLSX.utils.json_to_sheet(linhas, { header });
```

Passar `header` explícito é o que garante a ordem — sem isso o SheetJS usaria a ordem das
chaves do primeiro objeto.

`planilhaVendas()` e `planilhaPendencias()` são duas chamadas dessa função com cabeçalhos
diferentes. Cada arquivo tem **uma aba só**: a Spedy importa a primeira, e separar as
pendências em outro arquivo elimina o risco de ela importar as duas.

---

# 2. `scripts/gerar-tabela-ddd-cep.js`

Roda uma vez, precisa de internet, não usa banco. Produz `lib/ceps/{ddd}.json`.

O objetivo é que o gerador semanal **nunca** consulte a rede. Uma consulta de CEP por pedido,
toda semana, acabaria em bloqueio por volume.

## `ALVOS` — [linha 22](../scripts/gerar-tabela-ddd-cep.js:22)

Meta de endereços por DDD, proporcional à população da região. 67.000 no total. O DDD 11
recebe 37 vezes mais endereços que o 46, espelhando de onde os clientes realmente vêm. Meta
fixa desperdiçaria raspagem em Francisco Beltrão e deixaria São Paulo com pouca variedade.

A lista de DDDs válidos não é duplicada aqui — [linha 93](../scripts/gerar-tabela-ddd-cep.js:93)
deriva de `DDDS_VALIDOS`, e `ALVOS` só define a meta de cada um.

## `TERMOS` — [linha 118](../scripts/gerar-tabela-ddd-cep.js:118)

48 palavras comuns em nome de rua: `Rua`, `Avenida`, `Brasil`, `São`, `Sete`, `Presidente`,
`Nossa Senhora`, `Tiradentes`…

A ViaCEP limita a busca por logradouro a **50 resultados** (medido: `Rua` em Blumenau devolve
exatamente 50). A variedade de termos é o que enche a lista — cada combinação cidade × termo é
uma janela nova de até 50 endereços.

## `buscar()` — [linha 152](../scripts/gerar-tabela-ddd-cep.js:152)

`fetch` com repetição e recuo progressivo:

```js
if (res.status === 404 || res.status === 400) return null;   // desiste: não existe
if (res.status === 429 || res.status >= 500) throw ...;      // repete: é temporário
```

`400`/`404` significam "essa cidade+termo não tem nada" — repetir só gasta tempo. `429`
(limite de taxa) e `5xx` são temporários, e o `dormir(PAUSA_MS * 4 * t)` no `catch` espera
cada vez mais: 1,2s, 2,4s, 3,6s.

## `enderecosDe()` — [linha 172](../scripts/gerar-tabela-ddd-cep.js:172)

```js
.filter((r) => r && r.logradouro && !r.unidade && r.ibge && String(r.ddd) === String(ddd))
```

Quatro filtros, cada um com um motivo:

- `r.logradouro` — descarta CEP geral de cidade, que não tem rua
- `!r.unidade` — `unidade` preenchida é CEP de agência dos Correios ou caixa postal, não serve
  como endereço de pessoa
- `r.ibge` — o código do município precisa existir
- `String(r.ddd) === String(ddd)` — **a validação central**. A própria ViaCEP devolve o DDD de
  cada endereço; comparar com o DDD alvo garante que o endereço é mesmo daquela região, mesmo
  que a lista de cidades da BrasilAPI traga alguma de área limítrofe. A tabela se valida
  sozinha.

O primeiro filtro explica por que DDDs de estados pouco povoados rendem uma cidade só: em
município pequeno os Correios usam um CEP geral sem logradouro, e ele é descartado aqui.

## `coletarDDD()` — [linha 192](../scripts/gerar-tabela-ddd-cep.js:192)

Duas fases. Primeiro pede as cidades do DDD à BrasilAPI, depois:

**Fase 1 — sondagem.** Uma consulta por cidade, sempre com o termo `Rua`:

```js
sondagem.push({ cidade, peso: achados.length });
...
sondagem.sort((a, b) => b.peso - a.peso);
```

Cidade que devolve 50 (o teto) tem muito mais a extrair; cidade que devolve 3 está quase
esgotada. O `peso` mede isso a 1 requisição por cidade.

**Fase 2 — rodadas por termo.** Um termo por vez, passando por **todas** as cidades antes de
repetir termo:

```js
for (const termo of TERMOS) {
  if (porCep.size >= alvo) break;
  if (termo === "Rua") continue;        // já usado na sondagem
  for (const { cidade } of produtivas) {
    if (porCep.size >= alvo) break;
    ...
  }
}
```

A ordem dos laços é o ponto. A versão anterior esgotava cidade por cidade, da maior para a
menor, e parava ao atingir a meta — o DDD 47 saía com 1.059 endereços **só de Joinville**, e
um cliente de Blumenau receberia um deles. Com as rodadas, o mesmo DDD 47 sai com 1.059
endereços em 22 cidades.

As cidades grandes ainda ficam mais representadas naturalmente: as pequenas secam depois de
uma ou duas rodadas e passam a devolver só CEP repetido.

O `Map porCep` faz a deduplicação — chave é o CEP, então o mesmo endereço em duas buscas conta
uma vez só.

## `main()` — [linha 247](../scripts/gerar-tabela-ddd-cep.js:247)

Percorre os DDDs e grava cada arquivo **assim que o DDD fecha**. É o que torna a raspagem
retomável: `Ctrl+C` no DDD 40 preserva os 39 anteriores, e a próxima execução pula quem já tem
arquivo. O log informa endereços **e cidades** por DDD, e no fim lista quem ficou abaixo da
meta.

DDD passado por argumento é validado contra `DDDS_VALIDOS` antes de qualquer requisição —
`node scripts/gerar-tabela-ddd-cep.js 23` falha na hora em vez de gastar dezenas de consultas
num DDD inexistente.

---

# 3. `scripts/marcar-historico-spedy.js`

Roda uma vez, antes do primeiro lote. Já executado: 96.865 pedidos marcados.

O problema que resolve: `nota_importada` nasceu com `DEFAULT false`, então **todo pedido da
história** ficou elegível. Sem o backfill, o primeiro lote viria com meses de vendas antigas.

## O filtro — [linha 65](../scripts/marcar-historico-spedy.js:65)

```js
const where = {
  nota_importada: false,
  OR: [
    { data_pedido: { lt: corte } },
    { data_pedido: null, criado_em: { lt: corte } },
  ],
};
```

O `OR` existe porque `data_pedido` é opcional no schema — pedidos antigos podem ter só
`criado_em`.

Repare que **não há filtro de status**. Um pedido de junho que só for pago em setembro
continua sendo uma venda de junho, e a decisão foi emitir de julho em diante. Filtrar por
`status: "pago"` deixaria esses de fora do backfill e eles apareceriam num lote futuro. É por
isso que 96.865 foram marcados e não apenas os 46.040 pagos.

## A confirmação — [linha 21](../scripts/marcar-historico-spedy.js:21)

O script conta, mostra os 3 mais recentes e só então pergunta. Marcar errado aqui é caro: um
pedido marcado como `historico` nunca mais entra em lote, e a nota dele não seria emitida.

A marcação é reversível — um `UPDATE` limpando as duas colunas, não uma exclusão.

---

# 4. `scripts/gerar-lote-spedy.js`

O comando semanal. **Não escreve nada no banco.**

## `resolverLote()` — [linha 53](../scripts/gerar-lote-spedy.js:53)

```js
const usados = new Set((await prisma.pedido.findMany({
  where: { nota_lote: { startsWith: base } },
  select: { nota_lote: true },
  distinct: ["nota_lote"],
})).map((p) => p.nota_lote));

if (!usados.has(base)) return base;
for (let i = 1; i < 26; i++) {
  const rotulo = `${base}-${String.fromCharCode(97 + i)}`;  // -b, -c, -d…
  if (!usados.has(rotulo)) return rotulo;
}
```

Em uma frase: **o rótulo só avança se o anterior já foi marcado.**

- Gerou hoje, ainda não importou, gerou de novo → mesmo rótulo, arquivo sobrescrito
- Gerou, importou, rodou o `marcar-lote`, gerou de novo → `2026-07-31-b`

A consulta é no banco, não no sistema de arquivos, porque é o banco que sabe o que foi
efetivamente confirmado.

## A busca e o `--max` — [linhas 84 a 100](../scripts/gerar-lote-spedy.js:84)

```js
where: { status: "pago", nota_importada: false }
```

Duas condições, sem filtro de data. É isso que faz um pedido corrigido em agosto voltar
sozinho ao lote seguinte — com filtro por mês ele sairia da janela para sempre.

```js
const aptos = max ? processado.aptos.slice(0, max) : processado.aptos;
```

O `--max` corta **só as aptas**, não as pendências. Limitar as pendências faria você corrigir
os mesmos CPFs lote após lote sem ver o total. E corta as mais antigas primeiro, porque a
query vem ordenada por `criado_em` — nota deve acompanhar a operação, não a ordem de chegada
no arquivo.

## Os três arquivos — [linhas 103 a 119](../scripts/gerar-lote-spedy.js:103)

Tudo vai para `dirLote(lote)` — `07.26/2026-07-31`, mês de alocação e pasta da remessa.

`lote-{lote}.json` guarda os IDs que entraram no arquivo:

```js
ids: aptos.map((l) => l.Venda_codigo),
```

Este é o ponto mais importante do desenho. O script de marcação lê **esta lista**, e não "tudo
que está pendente agora". Entre gerar o arquivo e confirmar a importação podem ter entrado
vendas novas — elas não estão na planilha que subiu, e marcar elas junto faria essas notas
nunca serem emitidas.

## O resumo de pendências — [linha 218](../scripts/gerar-lote-spedy.js:218)

Agrupa por motivo em vez de listar linha a linha. Com 7.692 pendências a listagem completa
rolaria a tela sem informar nada; o detalhe de cada pedido está na planilha. Um pedido com
dois problemas conta nos dois motivos.

---

# 5. `scripts/conciliar-extrato-spedy.js`

O extrato do AbacatePay é a verdade sobre o que foi pago. Este script confere a tabela
`Pedido` contra ele e corrige as duas divergências que aparecem na prática.

## Por que existe

Julho teve **27 vendas pagas que o portal não registrou como pagas** — 15 presas em
`pendente` porque o webhook de confirmação falhou, e 12 sem pedido nenhum porque o checkout
morreu depois de gerar o PIX. Os primeiros seis dias de agosto tiveram mais 9. Sempre
concentrados em poucos dias, o que aponta para janelas de instabilidade e não falha contínua.

O impacto vai além da nota: o fluxo de produção musical só dispara depois do `status = pago`,
então essas pessoas pagaram e não receberam nada.

## O que corrige e o que só relata

```js
const aPagar = dep.filter((r) => mapa[r.paymentIntentId]?.status === "pendente");
const aCriar = dep.filter((r) => !mapa[r.paymentIntentId]);
```

Corrige: `pendente` com pagamento confirmado vira `pago`; pagamento sem pedido vira pedido
novo, montado por `pedidoDoExtrato()`.

Só relata: **cancelado com pagamento confirmado** e **valor divergente**. Os dois podem ser
reembolso legítimo ou erro de lançamento, e nenhuma regra automática acerta sempre.

## `pedidoDoExtrato()`

Mapeia os campos do gateway para o `Pedido`. Duas escolhas que merecem nota:

`plano` sai do valor — R$ 37 é `basic`, R$ 47 é `silver`. É inferência, mas os dois preços
não colidem.

`nome` recebe o nome do pagador. Normalmente esse campo guarda o **homenageado** da música,
que vinha no briefing; como o briefing se perdeu junto com o checkout, o pagador é a única
identificação disponível. `estilo` e `letra` ficam nulos de propósito — sinalizam que falta
o briefing, e o pedido aparece no portal como pago sem música gerada.

## Idempotência

`updateMany` filtra por `status: "pendente"` e `createMany` usa `skipDuplicates`. Rodar duas
vezes no mesmo extrato não faz nada na segunda — o que importa, porque a conciliação do mês
tende a ser repetida conforme novos extratos são exportados.

---

# 6. `scripts/aplicar-correcoes-spedy.js`

Lê a planilha de pendências corrigida à mão e grava no banco. É o que fecha o ciclo:
`gerar → editar a planilha → corrigir → regerar`.

## O formulário de ida e volta

A planilha de pendências é gerada por `planilhaPendencias()` com três colunas editáveis —
`Cliente_nome`, `Cliente_cpfcnpj`, `Cliente_celular` — e as `ref_*` só de contexto.

O detalhe que faz a volta funcionar está em `processar()`, [linha 475](../lib/spedy.js:475):
as colunas editáveis trazem o valor **cru do banco**, sem nenhum fallback. `Cliente_nome`
mostra apenas `nomefiscal`; se estiver vazio, sai vazio. A versão anterior caía para `nome`,
e como `nome` é o homenageado da música, uma correção manual gravaria a pessoa errada como
destinatário da nota.

## `acharPlanilha()` — [linha 38](../scripts/aplicar-correcoes-spedy.js:38)

Mesma busca em três caminhos do `marcar-lote-spedy.js`, do layout atual para os antigos.

## `validarCampo()` — [linha 49](../scripts/aplicar-correcoes-spedy.js:49)

Aplica a mesma régua do gerador: CPF com dígito verificador, nome não vazio depois de
`limparNome`, telefone com DDD que existe. Não adianta aceitar na correção o que o gerador
recusaria depois — o pedido voltaria para a lista.

## Comparar antes de validar — [linha 109](../scripts/aplicar-correcoes-spedy.js:109)

```js
const digitado = String(l[coluna] ?? "").trim();
if (!digitado) continue;              // em branco = não mexi

const comparavel = campo === "nomefiscal" ? digitado : dig(digitado);
const antes = campo === "nomefiscal" ? String(atual[campo] ?? "").trim() : dig(atual[campo]);
if (comparavel === antes) continue;   // igual ao banco = não mexi

const r = validarCampo(coluna, digitado);
```

A ordem das três checagens é o ponto. A célula que você **não** tocou ainda contém o valor
ruim que colocou o pedido na lista — validá-la produziria uma recusa que não é sua. Na
primeira versão isso gerava 139 "erros" para 3 células editadas.

Comparar por dígitos em CPF e telefone evita falso positivo de formatação: `"529.982.247-25"`
e `"52998224725"` são o mesmo valor.

## A gravação

`update` um a um, não `updateMany`, porque cada pedido recebe valores diferentes. São no
máximo algumas dezenas de linhas, então o custo é irrelevante. Mostra campo a campo o que
vai mudar e pergunta antes.

---

# 7. `scripts/marcar-lote-spedy.js`

Roda depois que a importação deu certo na Spedy.

## `acharArqLote()` — [linha 28](../scripts/marcar-lote-spedy.js:28)

Procura o JSON em três lugares, do layout atual para os antigos:

```
exports/07.26/2026-07-31/   ← hoje: mês de alocação + pasta do lote
exports/2026-07-31/         ← antes do agrupamento por mês
exports/                    ← antes da pasta por lote
```

Um lote gerado numa versão anterior continua sendo confirmável — o que importa, porque entre
gerar e marcar pode passar um dia e uma mudança de organização. Se não achar em nenhum,
imprime os caminhos tentados em vez de um erro genérico.

## A proteção — [linha 64](../scripts/marcar-lote-spedy.js:64)

```js
const jaMarcados = registros.filter((p) => p.nota_importada);
if (jaMarcados.length) { ... process.exitCode = 1; return; }
```

Aborta se qualquer pedido do lote já estiver marcado, mostrando quais e em que lote foram.
Cobre rodar o comando duas vezes por engano e rodar o rótulo errado. O `updateMany` no fim
ainda carrega `nota_importada: false` no `where`, como segunda camada.

## A confirmação

A pergunta é sobre a Spedy, não sobre o comando — é o único ponto do fluxo em que o sistema
depende de uma informação que só existe fora dele. Existe `--sim` para automação, mas usá-lo
aqui derrota o propósito.

Se a importação falhou, basta **não rodar este script**: os pedidos continuam pendentes e
entram no próximo lote automaticamente.
