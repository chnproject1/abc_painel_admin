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

## `PADROES` — [linha 46](../lib/spedy.js:46)

```js
const PADROES = {
  formaPagamento: "PIX",         // o checkout é PIX via AbacatePay
  status: "Aprovado",            // só exportamos pedidos já pagos
  enviarEmail: "Sim",
  perfil: "Produtor",
  transmitirNota: "Manualmente", // entra na Spedy sem transmitir
  modeloNf: "nfe",
  pais: "Brasil",
  numeroEndereco: "S/N",
};
```

`transmitirNota: "Manualmente"` é a decisão mais importante daqui. As vendas entram na Spedy
mas as notas **não são transmitidas sozinhas** — dá espaço para conferir antes.

## `NOME_PLANO` — [linha 60](../lib/spedy.js:60)

Só embeleza a descrição: `silver` → "Música personalizada — plano Silver". Plano fora do mapa
usa o valor cru, então nada quebra.

**Não existe lista de planos permitidos, e é intencional.** A tributação da NF-e (NCM, CFOP,
unidade) vem da configuração global em *Configurações > NF-e* na Spedy e vale para todas as
vendas — os planos não precisam de cadastro individual de produto. Um portão de validação
aqui só criaria bloqueio falso: uma venda paga ficaria de fora do lote por causa do nome do
plano, mesmo com a nota perfeitamente emissível. Plano novo entra sozinho.

## `dirExports()`, `mesDoLote()` e `dirLote()` — [linhas 71 a 96](../lib/spedy.js:71)

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

## `normalizarTelefone()` — [linha 148](../lib/spedy.js:148)

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

## `dddDe()` — [linha 154](../lib/spedy.js:154)

Os 2 primeiros dígitos do telefone normalizado, e só se sobrarem ao menos 10. Telefone curto
ou lixo devolve `null`.

## `DDDS_VALIDOS` — [linha 162](../lib/spedy.js:162)

Os 67 DDDs em uso no Brasil, como `Set`. Serve para distinguir dois problemas que exigem
ações opostas:

- `sem tabela de endereços para o DDD 11 — rodar spedy:ceps` → resolve com a raspagem
- `DDD 23 não existe — corrigir o telefone` → raspar nunca resolveria; o cadastro está errado

Sem essa distinção, a mensagem seria "sem tabela para o DDD 23" e apontaria para a solução
errada. É também a lista autoritativa usada por `gerar-tabela-ddd-cep.js`.

## `cpfValido()` — [linha 175](../lib/spedy.js:175)

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

## `dataBR()` — [linha 202](../lib/spedy.js:202)

```js
return new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
}).format(new Date(d));
```

O `timeZone` explícito não é detalhe. As datas no banco são instantes UTC (`data_pedido:
new Date()` em [app/api/checkout/route.ts:158](../app/api/checkout/route.ts:158)). Um pedido das
22h do dia 31 é o dia seguinte em UTC — sem o fuso, sairia com data `01/08` e cairia na
competência errada.

## `inicioDoDiaBR()` — [linha 223](../lib/spedy.js:223)

O caminho inverso: converte `"2026-07-01"` no instante UTC da meia-noite em São Paulo,
somando as 3 horas de diferença. É o que faz o corte do backfill cair exatamente na virada
do dia no Brasil.

## `listaDeCeps()` — [linha 234](../lib/spedy.js:234)

Lê `lib/ceps/{ddd}.json` e guarda num `Map`. O cache evita reler o arquivo a cada pedido: num
lote de 200 vendas do DDD 11, o `11.json` (7.346 endereços) é lido do disco **uma vez**, não
200. O `Map` guarda também o resultado negativo (`null`), então um DDD sem tabela não é
reprocurado.

## `enderecoPara()` — [linha 269](../lib/spedy.js:269)

```js
function enderecoPara(pedido) {
  const ddd = dddDe(pedido.telefone);
  if (!ddd) return null;
  const lista = listaDeCeps(ddd);
  if (!lista) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}
```

Sorteia um endereço da região do DDD do cliente. Devolve `null` nos dois casos em que não dá
para seguir, e quem trata é o `validar()`.

O endereço não é o do cliente: o checkout não coleta endereço e a NF-e não é transmitida sem
endereço de destinatário. É um endereço real e coerente (CEP, bairro, município e UF saem
todos do mesmo registro dos Correios), o que faz passar na validação da SEFAZ.

O sorteio é aleatório de verdade, sem semente. Isso é seguro porque o `.xlsx` gerado é o
registro do que foi enviado — mas implica que **regerar um lote já importado produz endereços
diferentes** e quebra a correspondência com as notas emitidas. Está documentado como regra de
operação em [manual de operação](emissao-nfe-manual.md).

## `validar()` — [linha 293](../lib/spedy.js:293)

Devolve um array de motivos. Vazio = apto. Um pedido pode acumular vários:

| Checagem | Motivo |
|---|---|
| CPF vazio / `00000000000` / ≠ 11 dígitos / DV inválido | 4 mensagens distintas |
| `valor` nulo ou ≤ 0 | `valor ausente` / `valor zerado ou negativo` |
| `nomefiscal` e `nome` vazios | `nome do cliente ausente` |
| telefone sem DDD | `telefone sem DDD reconhecível` |
| DDD fora de `DDDS_VALIDOS` | `DDD 23 não existe — corrigir o telefone` |
| DDD sem arquivo em `lib/ceps/` | `sem tabela de endereços para o DDD 11 — rodar spedy:ceps` |
| sem `data_pedido` nem `criado_em` | `sem data do pedido` |

As mensagens são específicas de propósito e terminam apontando a ação. O `00000000000` tem
checagem própria porque é o `@default` da coluna em
[prisma/schema.prisma:30](../prisma/schema.prisma:30) — é o caso mais comum, não um CPF digitado
errado.

## `montarLinha()` — [linha 339](../lib/spedy.js:339)

Monta o objeto de 30 chaves. O truque está no final:

```js
for (const c of COLUNAS) if (!(c in linha)) linha[c] = "";
```

Em vez de escrever as 30 chaves à mão (metade vazias), preenche só as que têm conteúdo e
completa o resto varrendo `COLUNAS`. Se uma coluna for acrescentada no array, ela já sai vazia
na planilha em vez de sumir. `Cliente_razaosocial` e `Cliente_inscricaoestadual` caem nesse
preenchimento — todos os clientes são PF.

## `processar()` — [linha 375](../lib/spedy.js:375)

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

O detalhe que faz a volta funcionar está em `processar()`, [linha 375](../lib/spedy.js:375):
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
