# Emissão de NF-e — do zero até a nota emitida

Manual de operação. Para entender **como o código funciona**, veja
[emissao-nfe-codigo.md](emissao-nfe-codigo.md).

O sistema gera uma planilha com as vendas pagas que ainda não viraram nota, no layout de
importação da Spedy. Nada aqui toca o painel admin — são só scripts de linha de comando.

Referência do layout: [Importação de vendas via planilha](https://ajuda.spedy.com.br/pt-br/article/importacao-de-vendas-via-planilha-1ixmk29/)

---

# Os seis comandos

```
npm run spedy:ceps        raspagem de endereços (uma vez)
npm run spedy:historico   backfill (uma vez, já feito)
npm run spedy:conciliar   confere o extrato do AbacatePay contra o portal
npm run spedy:lote        gera
npm run spedy:corrigir    aplica as correções da planilha de pendências
npm run spedy:marcar      finaliza
```

O ciclo do mês é **conciliar → gerar → corrigir pendências → importar na Spedy →
transmitir → finalizar**. Detalhe de cada um em [Comandos](#comandos), no fim.

## Se o PowerShell recusar o `npm`

```
npm : O arquivo npm.ps1 não pode ser carregado porque a execução de scripts
foi desabilitada neste sistema.
```

É a política de execução do Windows bloqueando o wrapper `npm.ps1` — não tem relação com
estes scripts. Chame o Node direto:

```
node scripts/gerar-tabela-ddd-cep.js
node scripts/marcar-historico-spedy.js
node scripts/conciliar-extrato-spedy.js extrato_2026-08-01_2026-08-31.json
node scripts/gerar-lote-spedy.js 2026-07-31 --ate=2026-07-31
node scripts/aplicar-correcoes-spedy.js 2026-07-31
node scripts/marcar-lote-spedy.js 2026-07-31
```

**Na forma direta não precisa do `--`** antes das opções — aquilo era exigência do npm para
repassar argumentos. `npm.cmd run ...` também funciona, por usar o wrapper `.cmd` em vez do
`.ps1`.

---

# Estado atual (07/08/2026)

| | |
|---|---|
| Colunas `nota_importada` / `nota_lote` no banco | ✅ criadas |
| Backfill até 30/06/2026 | ✅ 96.865 pedidos como `historico` |
| Pedidos de 01/07 do CNPJ anterior | ✅ 804 como `historico` |
| Tabela de endereços | ✅ 67 DDDs, 67.000 endereços |
| **Lote de julho** | `2026-07-31` — **7.611 notas, R$ 335.001** |
| Pendências de julho | 3 — nomes que não são nome de pessoa |
| Julho importado na Spedy | ⬜ **não** — falta importar e rodar o `spedy:marcar` |
| Agosto conciliado até 06/08 | ✅ 1.157/1.157 |

Ordem de grandeza: ~110 mil pedidos na base, ~53 mil pagos.

> **A ordem importa agora.** Julho continua na fila porque o lote não foi marcado. Enquanto
> isso, um lote de agosto levaria julho junto — o `--ate` só corta em cima. Importe julho,
> rode `spedy:marcar 2026-07-31`, e só então feche agosto.

## Regras de formato exigidas pelo contador

Todas aplicadas em `lib/spedy.js` e verificadas a cada geração.

| Regra | Como sai |
|---|---|
| CPF sem ponto nem traço | 11 dígitos corridos — `02642063984` |
| CEP sem traço | 8 dígitos corridos — `87730005` |
| Zero à esquerda preservado | 2.675 CPFs e 645 CEPs de julho começam com zero |
| Texto sem caractere especial | acento, hífen, ponto e parênteses viram espaço |
| Texto curto | no máximo **40** caracteres |
| Número do endereço | `0` (não coletamos número) |
| Código do produto | `S200` |
| Descrição do produto | `SENTINDO O PODER DA MUSICA ISBN 9786502267752` |

O limite de 40 é a constante `MAX_TEXTO`. A NF-e aceita 60; com 40, apenas 3 nomes dos 7.614
de julho precisaram ser abreviados.

### Zero à esquerda: por que não se perde

As células saem como **texto** no `.xlsx`, não como número. Se saíssem numéricas, o Excel
comeria o primeiro dígito e 2.675 CPFs ficariam com 10. Há um teste que confere o tipo da
célula depois de gerar.

### Como o nome é tratado

**Prefixo removido.** O cliente às vezes escreve `Nome Alcir Vacht` ou `Meu nome Moziel
Cassiano`. Vira `Alcir Vacht` e `Moziel Cassiano`.

**Nome longo perde o meio.** `Moacir Ferreira e Neila Ap de Sa Ferreira` → `Moacir Ferreira`.

**Endereço longo mantém o começo**, e não o meio: `Avenida Vereador Francisco de Paula Gomes
dos Santos` → `Avenida Vereador Francisco de Paula`. Descartar o meio como no nome viraria
`Avenida Santos`, que é outra rua.

**Recado vira pendência.** Quando o campo tem `Quero deixar sem meu nome` ou `Nossa musica e
so pra contrariar o nome da musica`, o pedido é bloqueado em vez de sair com isso na nota.
Foram 3 em julho.

A detecção compara palavra a palavra contra uma lista (`musica`, `amor`, `quero`, `chama`…),
nunca por busca de texto: `Maria das Dores de Amorim`, `Sempre Silva` e `Parana Ribeiro`
passam, embora contenham "amor", "sem" e "para" como substring.

## `cancelado` também gera nota

O botão **"Contato inválido"** do portal grava `status: "cancelado"`, e é o **único lugar em
todo o sistema** que grava esse status. Não existe cancelamento de verdade — a venda
aconteceu, o dinheiro entrou, só a entrega falhou.

Por isso `STATUS_FATURAVEIS = ["pago", "cancelado"]`. Sem isso, 19 vendas de julho ficariam
sem nota.

> **Se um dia existir estorno, ele precisa de status próprio.** Reaproveitar `cancelado`
> faria sair nota para venda desfeita.

## Um caso resolvido que vale lembrar

A troca de CNPJ aconteceu no meio de **01/07/2026**: último pedido do CNPJ anterior às
22:39, primeiro do novo às 22:50. Os 449 pagos anteriores àquele horário foram marcados como
`historico` para nunca entrarem em lote do CNPJ atual.

Também foram marcados 3 pedidos de teste de R$ 1 com nome "Cliente".

---

# Parte 1 — Preparação

## 1.1 Do lado da Spedy

Sem isso a planilha importa mas a nota não sai.

- [ ] **Plano Essencial ou superior.** A importação via planilha não existe nos planos abaixo.
- [ ] **Certificado digital A1** (`.pfx`) carregado e válido.
- [ ] **Dados da empresa completos:** CNPJ, inscrição estadual, regime tributário e endereço fiscal.
- [ ] **Configuração global de NF-e.** É o item que trava a emissão se faltar. Em
      *Configurações > NF-e*: NCM, CFOP interno, CFOP interestadual (contribuinte e não
      contribuinte), CFOP internacional, unidade tributável. Esses valores valem para
      **todas** as vendas — peça ao seu contador.
- [ ] **Regra de tributação** criada em *Tributação* (menu sob seu nome, canto superior direito).

Não é preciso cadastrar cada plano como produto. O cadastro individual existe só para
produto com tributação diferente dos outros ("Se um produto tiver uma configuração de
tributos específica, como um NCM diferente, você poderá configurar os dados direto no
cadastro do produto"). Seus planos são todos música personalizada digital — mesmo NCM,
mesmo CFOP.

Consequência prática: **plano novo não exige nenhuma alteração no código.**

## 1.2 Colunas no banco — feito

Criadas manualmente na VPS:

```sql
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "nota_importada" BOOLEAN NOT NULL DEFAULT false;
```

```sql
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "nota_lote" TEXT;
```

Já declaradas em [prisma/schema.prisma](../prisma/schema.prisma:36). **Não remova essas duas
linhas do schema** — um `npm run db:push` futuro entenderia que as colunas estão sobrando e
apagaria o controle de tudo que já foi emitido.

`nota_importada` é `NOT NULL` mas tem `DEFAULT false`: um `INSERT` que não cita a coluna
funciona normalmente, então o checkout não quebra.

## 1.3 Conexão com o banco

O Postgres da VPS aceita conexão direta, então basta o `.env` local:

```
DATABASE_URL="postgresql://postgres_abc:SENHA@31.97.169.193:5432/abc_music"
```

Senha com caractere especial vai codificada: `@` → `%40`, `#` → `%23`, `$` → `%24`,
`%` → `%25`, `/` → `%2F`.

Conferir sem expor a senha:

```bash
node -e "require('dotenv').config();const u=new URL(process.env.DATABASE_URL);console.log(u.hostname+':'+(u.port||5432)+u.pathname+' usuario='+u.username)"
```

> **Nota de segurança.** A porta 5432 aberta na internet significa que qualquer um alcança o
> banco e pode tentar senha — e ali estão CPF, telefone e e-mail dos clientes. Quando o
> processo estiver estável, vale fechar no `pg_hba.conf` e no firewall e passar a usar
> túnel SSH: `ssh -N -L 5433:localhost:5432 root@31.97.169.193`, com o `.env` apontando
> para `localhost:5433`. O resto funciona igual.

## 1.4 Onde os arquivos são gravados

Uma pasta por lote. Configure a raiz no `.env`:

```
SPEDY_EXPORTS_DIR="C:/Users/julia/Documents/ABC_MUSIC/NFS"
```

Use barras normais mesmo no Windows. Sem essa variável, os arquivos vão para
`<projeto>/exports`. Como o `.env` é por máquina, a VPS usa o padrão sem configuração.

```
NFS/
  07.26/                                ← mês de alocação (competência)
    2026-07-31/                         ← o lote
      spedy-vendas-2026-07-31.xlsx      ← sobe na Spedy
      lote-2026-07-31.json              ← lista de IDs, usada pelo spedy:marcar
      spedy-pendencias-2026-07-31.xlsx  ← só existe se houver bloqueados
  08.26/
    2026-08-31/
      ...
```

São dois níveis porque um mês pode ter mais de um lote — se você fatiar por semana ou
refizer um. O mês agrupa a competência, a pasta do lote isola cada remessa.

**O mês sai do rótulo do lote**, não da data em que você rodou. Um lote gerado em agosto
com `--ate=2026-07-31` e rotulado `2026-07-31` cai em `07.26`, que é o correto.

**Não mude `SPEDY_EXPORTS_DIR` entre gerar e marcar um lote** — o `spedy:marcar` procura o
JSON na pasta configurada no momento em que roda.

### Guarde esses arquivos

O endereço sorteado **não fica no banco** — ele existe apenas dentro do `.xlsx`. Esses
arquivos são o **único registro** de qual endereço foi declarado à SEFAZ em cada nota.

`C:\Users\julia\Documents` é uma pasta local, fora do OneDrive: não há sincronização nem
backup automático. Se o disco falhar, a rastreabilidade se perde. Vale manter alguma cópia
por outro meio.

## 1.5 Tabela de endereços

```bash
npm run spedy:ceps
```

Não usa banco — roda em qualquer lugar. Precisa de internet e leva **1 a 2 horas**.

Raspa a ViaCEP e grava `lib/ceps/{ddd}.json` para os 67 DDDs, em quantidade proporcional à
população da região: 7.346 endereços para o DDD 11, 198 para o 46, 67.000 no total. Depois
disso o gerador de lote nunca mais consulta a rede — que é o objetivo, para não levar
bloqueio por volume.

É retomável: pode interromper com `Ctrl+C` e rodar de novo, que ele pula os DDDs já
prontos. O log mostra quantos endereços e **em quantas cidades** cada DDD rendeu.

Para refazer um DDD específico:

```bash
node scripts/gerar-tabela-ddd-cep.js 47 --forcar
```

> **DDD com uma cidade só é normal.** Em município pequeno os Correios usam um CEP geral,
> sem detalhar logradouro, e endereço sem rua não serve para NF-e. No DDD 95, por exemplo,
> só Boa Vista tem CEPs de rua — as outras cidades de Roraima devolvem 1 ou 2 resultados
> cada. O mesmo vale para 68 (Acre), 96 (Amapá) e 97. Em DDDs de estados povoados a
> distribuição é ampla: o 47 saiu com 1.059 endereços em 22 cidades.

## 1.6 Backfill do histórico — feito

```bash
npm run spedy:historico
```

Marcou tudo anterior a **01/07/2026** como `nota_lote = "historico"`: 96.865 pedidos, dos
quais 46.040 pagos (R$ 2.019.423). Eles nunca entram em lote.

A marcação é reversível — um `UPDATE` limpando `nota_importada` e `nota_lote`, não uma
exclusão. Se a decisão sobre o histórico mudar, dá para trazer de volta.

---

# Parte 2 — Rotina

## Passo 1 — Gerar o lote

**Fechando um mês** — é o uso normal:

```bash
npm run spedy:lote -- 2026-07-31 --ate=2026-07-31
```

A busca é `status = "pago" AND nota_importada = false`, e o `--ate` limita a data. Sem ele,
um lote gerado em agosto levaria junto as vendas de agosto — foi o que aconteceu na primeira
tentativa, que saiu com 8.870 em vez das 7.942 de julho.

**Para limitar o tamanho:**

```bash
npm run spedy:lote -- --max=50
```

O `--max` corta só as vendas aptas, pegando as mais antigas primeiro; o resto fica pendente
e sai no lote seguinte. As pendências continuam listadas por inteiro. A documentação da
Spedy não menciona limite de linhas por importação, e subir 7.900 de uma vez sem nunca ter
testado é risco que vale evitar na primeira remessa.

Saída esperada:

```
Lote 2026-07-31
  corte: vendas até 2026-07-31
  pagos aguardando nota: 8035
  aptos:                 7942  (R$ 349118.00)
  pendentes:             93

✓ .../NFS/07.26/2026-07-31/spedy-vendas-2026-07-31.xlsx
✓ .../NFS/07.26/2026-07-31/lote-2026-07-31.json
✓ .../NFS/07.26/2026-07-31/spedy-pendencias-2026-07-31.xlsx

Pendências por motivo:
     59 × telefone sem DDD reconhecível
     31 × CPF é o valor padrão (00000000000)
      1 × DDD 23 não existe — corrigir o telefone
```

Este comando **não altera nada no banco**. Pode rodar quantas vezes quiser — com uma
ressalva importante no Passo 5.

## Passo 2 — Corrigir as pendências

O console resume por motivo; o detalhe de cada pedido está em `spedy-pendencias-*.xlsx`.
**Preencha direto na planilha** — as três colunas editáveis são `Cliente_nome`,
`Cliente_cpfcnpj` e `Cliente_celular`.

| Motivo | O que fazer |
|---|---|
| `CPF é o valor padrão (00000000000)` | Pedir o CPF ao cliente, ou buscar no extrato do AbacatePay |
| `CPF com dígito verificador inválido` | CPF digitado errado — conferir com o cliente |
| `nome fiscal ausente` | Preencher com o nome de **quem pagou** |
| `nome fiscal não parece nome de pessoa` | O cliente escreveu um recado no campo. Preencher o nome real |
| `valor ausente` | Corrigir no portal (não é editável na planilha) |
| `sem tabela de endereços para o DDD 11 — rodar spedy:ceps` | Falta raspar aquele DDD |

**Telefone não bloqueia mais.** Quando vem truncado, o endereço passa a ser sorteado entre
todos os DDDs e `Cliente_celular` sai vazio na nota — o celular é opcional na NF-e. Em julho
isso destravou 55 pedidos que só tinham o DDD gravado.

> **O extrato do AbacatePay resolve o CPF.** Ele guarda `customer.taxId` e `customer.name` de
> cada pagamento, cruzáveis pelo `paymentIntentId`, que é o mesmo `Venda_codigo`. Em julho
> recuperou 31 de 31 CPFs. O telefone ele **não** resolve: chega truncado nos dois sistemas,
> porque o problema é no checkout.

Depois de preencher, salve, feche o Excel e rode o [`spedy:corrigir`](#corrigir-pendências).
Só então volte ao Passo 1 para regerar.

O que não der para corrigir a tempo pode ficar: esses pedidos continuam pendentes e entram
no lote seguinte, sozinhos.

## Passo 3 — Importar na Spedy

1. **Vendas** → **Ações em Lote** → **Importar vendas**
2. **Selecionar um arquivo** → escolha o `spedy-vendas-*.xlsx` da pasta do lote
3. **Importar**
4. Confira o resultado: total importado e eventuais linhas recusadas

Suba apenas o `spedy-vendas-*`. O `spedy-pendencias-*` é para seu controle.

## Passo 4 — Transmitir as notas

As vendas entram com `Venda_transmitirnota = "Manualmente"` — ficam lançadas na Spedy mas
**as notas não são transmitidas sozinhas**. É proposital: dá espaço para conferir antes de
mandar para a SEFAZ.

Se preferir que saiam automáticas, troque `transmitirNota` para `"Imediatamente"` em
[lib/spedy.js](../lib/spedy.js:46).

## Passo 5 — Confirmar o lote

**Só depois que a importação deu certo:**

```bash
npm run spedy:marcar 2026-07-31
```

Ele mostra o total, pergunta se a importação deu certo e marca os pedidos daquele arquivo
como `nota_importada = true`. A partir daí não voltam em lote nenhum.

Existe `--sim` para pular a pergunta, mas aqui não vale usar: a pergunta é "a Spedy
aceitou?", a única informação que o sistema não tem como saber sozinho.

**Se a importação falhou, não rode este comando.** Os pedidos continuam pendentes e entram
no próximo lote.

> **Nunca regere um lote que já foi importado.** O endereço é sorteado a cada geração e não
> fica no banco. Regerar sortearia endereços diferentes, e o arquivo deixaria de
> corresponder às notas já emitidas na SEFAZ. Se precisar reorganizar arquivos, **mova**, não
> regere.

---

# Parte 3 — As 30 colunas, por obrigatoriedade

A documentação da Spedy marca obrigatoriedade misturando NF-e e NFS-e. Abaixo está o
recorte do nosso caso: **NF-e, cliente PF**. O detalhamento coluna por coluna está na aba
`Instruções` de `importacao-vendas-spedy.xlsx`.

## Obrigatórias sempre — 8

| Coluna | Origem |
|---|---|
| `Venda_codigo` | `Pedido.id` (PIX ID) — único, a Spedy recusa repetido |
| `Venda_data` | `data_pedido`, fallback `criado_em`, fuso de São Paulo |
| `Venda_dataaprovacao` | mesma data — o PIX aprova na hora |
| `Venda_valortotal` | `valor`, 2 casas com ponto decimal |
| `Venda_produtodescricao` | fixo: `SENTINDO O PODER DA MUSICA ISBN 9786502267752` |
| `modelo_nf` | `nfe`, fixo |
| `Cliente_cpfcnpj` | `cpf` em 11 dígitos corridos — obrigatório em nota de **produto** |
| `Cliente_nome` | `nomefiscal` — nunca o `nome`, que é o homenageado |

## Obrigatórias para transmitir — 6

A planilha **importa** com essas vazias, mas a NF-e não é **transmitida** sem endereço de
destinatário. Todas vêm sorteadas da tabela do DDD do telefone.

`Cliente_endereco_logradouro` · `Cliente_endereco_numero` (`0`) ·
`Cliente_endereco_bairro` · `Cliente_endereco_cep` · `Cliente_endereco_cidade` ·
`Cliente_endereco_estado`

O CEP tem que corresponder ao município — a SEFAZ valida. Como os dois saem do mesmo
registro dos Correios, batem por construção.

## Opcionais que preenchemos — 9

`Venda_formapagamento` (`PIX`, senão viria "Outras") · `Venda_status` (`Aprovado`) ·
`Venda_enviaremail` (`Sim`) · `Venda_perfil` (`Produtor`) · `Venda_transmitirnota`
(`Manualmente`) · `Venda_produtocod` (`S200`) · `Cliente_email` · `Cliente_celular` ·
`Cliente_endereco_pais` (`Brasil`)

`Cliente_celular` sai **vazio** quando o telefone veio truncado — nesse caso o endereço é
sorteado entre todos os DDDs, já que não dá para saber a região.

`Cliente_email` é formalmente opcional, mas necessário na prática porque
`Venda_enviaremail = Sim`.

## Deixadas vazias — 7

`Venda_datagarantia` · `descricao_nf` · `Cliente_razaosocial` (PJ) ·
`Cliente_inscricaoestadual` (PJ) · `Cliente_telefone` (usamos só celular) ·
`Cliente_inscricaomunicipal` (NFS-e/PJ) · `Cliente_endereco_complemento`

As constantes ficam em `PADROES`, no topo de [lib/spedy.js](../lib/spedy.js:46).

## Por que as 30 continuam no arquivo

O arquivo mantém as 30 colunas, com as 7 não usadas vazias, em vez de trazer só as 14 que
importam. **Não foi verificado se a Spedy casa as colunas pelo nome do cabeçalho ou pela
posição.** Se for por posição, remover coluna desloca todo o resto e os dados entram nos
campos errados.

Manter o layout idêntico ao modelo baixado da Spedy funciona nas duas hipóteses. Se o
suporte deles confirmar que o casamento é por nome, dá para enxugar — é só remover entradas
de `COLUNAS` em [lib/spedy.js](../lib/spedy.js:13).

---

# Parte 4 — O endereço não é o do cliente

O checkout não coleta endereço, e a NF-e não é transmitida sem endereço de destinatário. A
solução foi sortear um endereço real da região do DDD do telefone.

CEP, bairro, município e UF saem todos do mesmo registro dos Correios, então são coerentes
entre si e passam na validação da SEFAZ. O número vai como `S/N`.

Se um dia o checkout passar a coletar CEP e número, dá para trocar o sorteio pela consulta
real com pouca alteração: só a função `enderecoPara()` em [lib/spedy.js](../lib/spedy.js:203).

---

# Comandos

São seis. Dois rodam uma única vez na vida; quatro são a rotina.

```
npm run spedy:ceps        raspagem de endereços (uma vez)
npm run spedy:historico   backfill (uma vez, já feito)
npm run spedy:conciliar   confere o extrato do AbacatePay contra o portal
npm run spedy:lote        gera
npm run spedy:corrigir    aplica as correções da planilha de pendências
npm run spedy:marcar      finaliza
```

Todos rodam de dentro da pasta do projeto:

```bash
cd C:\Users\julia\OneDrive\Documentos\CLAUDE\abc-music-admin
```

## Detalhe de cada um

| Comando | Forma direta (sem npm) | O que faz | Escreve no banco? |
|---|---|---|---|
| `npm run spedy:ceps` | `node scripts/gerar-tabela-ddd-cep.js` | Raspa ~67 mil endereços da ViaCEP, 1–2h. Retomável. | Não — nem lê |
| `npm run spedy:historico` | `node scripts/marcar-historico-spedy.js` | Marca tudo anterior a 01/07/2026 como `historico` | **Sim** |
| `npm run spedy:conciliar <extrato>` | `node scripts/conciliar-extrato-spedy.js` | Corrige status e cria pedidos perdidos | **Sim** |
| `npm run spedy:lote` | `node scripts/gerar-lote-spedy.js` | Gera o `.xlsx` para subir na Spedy | Não |
| `npm run spedy:corrigir <lote>` | `node scripts/aplicar-correcoes-spedy.js` | Lê a planilha de pendências corrigida e grava | **Sim** |
| `npm run spedy:marcar <lote>` | `node scripts/marcar-lote-spedy.js` | Confirma que a importação deu certo | **Sim** |

### Gerar

```bash
npm run spedy:lote
```

Leva tudo que está na fila, e o rótulo é a data de hoje.

**Para fechar um mês**, informe o rótulo e o corte:

```bash
npm run spedy:lote -- 2026-07-31 --ate=2026-07-31
```

A data aparece duas vezes porque são coisas diferentes: a primeira nomeia o lote, o
`--ate` limita quais vendas entram. Sem o `--ate`, um lote gerado em agosto levaria
junto as vendas de agosto.

**Para limitar o tamanho:**

```bash
npm run spedy:lote -- --max=50
```

O `--` antes das opções é exigência do npm — sem ele, o npm tenta interpretar o
`--max` como configuração dele. Argumentos sem traço (como a data do rótulo) não
precisam.

### Conciliar com o gateway

**Rode antes de fechar o mês.** O AbacatePay é a verdade sobre o que foi pago; quando o
portal discorda, é porque o webhook de confirmação falhou ou o pedido nem chegou a ser
criado.

```bash
npm run spedy:conciliar extrato_2026-08-01_2026-08-31.json
```

| Situação | O que ele faz |
|---|---|
| `pendente` com pagamento confirmado | marca como `pago` |
| pagamento sem pedido no portal | cria o pedido a partir do extrato |
| `cancelado` com pagamento confirmado | **só avisa** — decisão sua |
| valor divergente entre portal e gateway | **só avisa** — decisão sua |

É seguro repetir: rodando duas vezes, a segunda não encontra nada.

Nos pedidos criados, `estilo` e `letra` ficam nulos — o briefing se perdeu junto com o
checkout e não há como recuperá-lo do extrato. Eles aparecem no portal como pago sem música
gerada.

> **Não é só nota fiscal.** Uma venda paga que ficou como `pendente` no portal não tem a
> música produzida, porque o fluxo depende do status. Julho teve 27 casos assim (R$ 1.169) e
> os seis primeiros dias de agosto tiveram 9. A conciliação é o que revela isso.

### Corrigir pendências

A planilha `spedy-pendencias-{lote}.xlsx` é um **formulário de ida e volta**. Você preenche
e este comando grava no banco:

```bash
npm run spedy:corrigir 2026-07-31
```

| Coluna | Editável? | Vai para |
|---|---|---|
| `Venda_codigo` | não — é a chave | — |
| `Motivo` | não | — |
| `Cliente_nome` | **sim** | `nomefiscal` |
| `Cliente_cpfcnpj` | **sim** | `cpf` |
| `Cliente_celular` | **sim** | `telefone` |
| `ref_*` | não — só contexto | nunca são lidas |

O `ref_nome_pedido` mostra o **homenageado da música**, que é diferente do pagador. Serve
para você identificar o pedido, não para copiar no nome fiscal.

Três garantias:

- **Célula em branco não apaga nada** — significa "não mexi"
- **Só o que você mudou é validado.** A célula intocada ainda tem o valor ruim que colocou o
  pedido na lista; revalidá-la encheria a tela de recusas que não são suas
- **Cada valor passa pela mesma validação do gerador** — CPF com dígito verificador, nome não
  vazio, telefone com DDD que existe. Linha recusada não bloqueia as outras

Ele mostra campo a campo o que vai mudar e pergunta antes de gravar.

> **A ordem importa: editar → corrigir → regerar.** O `spedy:lote` sobrescreve a planilha de
> pendências. Se você regerar antes de rodar o `spedy:corrigir`, as edições se perdem e não
> voltam.

### Finalizar

```bash
npm run spedy:marcar 2026-07-31
```

Lê o `lote-2026-07-31.json`, pergunta se a importação na Spedy deu certo e só então
grava `nota_importada = true` nos pedidos daquele arquivo. **Se a importação falhou,
não rode** — os pedidos continuam na fila e entram no próximo lote.

---

# Automação completa (alternativa futura)

A Spedy tem [API REST](https://docs.spedy.com.br) — dá para emitir a nota no momento em que
o pagamento confirma, direto do `/api/checkout`, sem planilha e sem importação manual. Vale
avaliar depois que o processo semanal estiver estável.
