# abcMusic — Documentação do Sistema

## Visão Geral

O portal abcMusic é um sistema interno de gestão de pedidos de músicas personalizadas.  
Substitui o Google Sheets como banco de dados central, mantendo compatibilidade com os sistemas externos existentes (Netlify, AbacatePay, UTMify, n8n).

---

## Fluxo Completo

### Etapa 1 — Entrada do Pedido (Checkout)

```
Cliente preenche o formulário
        ↓
Netlify (checkout page)
        ↓
POST /api/checkout
        ↓
Pedido criado no banco (status: pendente)
```

O checkout no Netlify envia os dados do cliente para o portal via POST.  
O portal registra o pedido com status `pendente` e todos os dados de campanha (UTMs, fbclid, IP).

**Campos recebidos:**
| Campo | Descrição |
|---|---|
| `id` | ID do PIX gerado pelo AbacatePay (ex: `pix_char_xxx`) |
| `name` | Nome do cliente |
| `phone` | Telefone |
| `mail` | Email |
| `plan` | Plano contratado (silver, gold, etc.) |
| `amount` | Valor pago |
| `status` | Status inicial (`pendente`) |
| `estilo` | Estilo musical escolhido |
| `letra` | Letra enviada pelo cliente |
| `utm_source`, `utm_campaign`, etc. | Dados de rastreamento de campanha |
| `fbclid` | ID do clique Facebook |
| `ip` | IP do cliente |

---

### Etapa 2 — Confirmação do Pagamento (AbacatePay)

```
Cliente paga o PIX
        ↓
AbacatePay confirma o pagamento
        ↓
AbacatePay → Webhook → Netlify (checkout page)
        ↓
POST /api/checkout  { action: "update", id: "pix_char_xxx" }
        ↓
Status do pedido atualizado para: pago
```

O AbacatePay notifica o Netlify quando o pagamento é confirmado.  
O Netlify então chama o portal para atualizar o status do pedido.

---

### Etapa 3 — Disparo do n8n (Netlify → n8n)

```
Netlify (após confirmar pagamento)
        ↓
GET /api/checkout?id=pix_char_xxx
        ↓
Portal retorna dados do cliente
        ↓
Netlify envia para UTMify (rastreamento de conversão)
        ↓
Netlify aciona o webhook do n8n com os dados do pedido
```

O Netlify busca os dados completos do pedido no portal (mesmo formato que retornava do Google Apps Script) e os encaminha para o n8n iniciar a produção.

**Dados retornados pelo portal para o Netlify:**
```json
{
  "data": {
    "status": "pago",
    "name": "Nome do Cliente",
    "phone": "47999999999",
    "mail": "cliente@email.com",
    "plan": "silver",
    "estilo": "Gospel",
    "letra": "...",
    "utm_source": "facebook",
    "utm_campaign": "campanha_x"
  }
}
```

---

### Etapa 4 — Produção da Música (n8n)

```
n8n recebe os dados do Netlify
        ↓
GPT gera ou adapta a letra
        ↓
Suno API gera o áudio da música
        ↓
n8n obtém: link_pagina, link_audio, link_basica, song_id
        ↓
POST /api/n8n  { action: "music_ready", id, links... }
        ↓
Portal atualiza: gerou_musica=true, links, data_entrega
```

O n8n é responsável por toda a geração da música.  
Ao finalizar, notifica o portal para registrar que a música foi gerada.

---

### Etapa 5 — Entrega via WhatsApp

```
n8n envia a música pelo WhatsApp
        ↓
Sucesso → POST /api/n8n  { action: "whats_entregue", id }
Erro    → POST /api/n8n  { action: "whats_erro", id }
        ↓
Portal atualiza: entrega_whatsapp = true / false
```

---

### Etapa 6 — Entrega via Email

```
n8n envia a música por email
        ↓
Sucesso → POST /api/n8n  { action: "email_entregue", id }
Erro    → POST /api/n8n  { action: "email_erro", id }
        ↓
Portal atualiza: entrega_email = true / false
```

---

### Etapa 7 — Erro de Geração

```
Falha na Suno API ou GPT
        ↓
POST /api/n8n  { action: "erro_geracao", id }
        ↓
Portal atualiza: gerou_musica=false, status=erro
```

---

### Diagrama Resumido

```
[Cliente] → Formulário Netlify
                ↓
         POST /api/checkout          ← cria pedido (pendente)
                ↓
[AbacatePay] → Webhook → Netlify
                ↓
         POST /api/checkout          ← marca como pago
                ↓
         GET  /api/checkout?id=xxx   ← busca dados
                ↓
         UTMify (conversão)
                ↓
         Webhook n8n
                ↓
         [GPT + Suno] geram música
                ↓
         POST /api/n8n (music_ready) ← registra música gerada
                ↓
         WhatsApp → POST /api/n8n (whats_entregue ou whats_erro)
                ↓
         Email   → POST /api/n8n (email_entregue ou email_erro)
```

---

## Estrutura do Código

```
abc-music-admin/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # Tela de login (avocado gradient)
│   ├── dashboard/
│   │   ├── page.tsx              # Busca de pedidos por telefone ou email
│   │   └── pedido/
│   │       └── [id]/
│   │           └── page.tsx      # Detalhe do pedido (edição, links, produção)
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts      # NextAuth — autenticação
│       ├── checkout/
│       │   └── route.ts          # PÚBLICO — entrada de pedidos e confirmação de pagamento
│       ├── search/
│       │   └── route.ts          # AUTENTICADO — busca de pedidos por telefone/email
│       ├── pedido/
│       │   └── [id]/
│       │       └── route.ts      # AUTENTICADO — detalhes e edição de pedido
│       ├── trigger/
│       │   └── [id]/
│       │       └── route.ts      # AUTENTICADO — dispara webhook n8n (produção)
│       └── n8n/
│           └── route.ts          # PÚBLICO c/ secret — callback do n8n (atualiza resultados)
├── lib/
│   ├── auth.ts                   # Configuração NextAuth + bcrypt
│   ├── prisma.ts                 # Cliente Prisma (singleton)
│   ├── columns.ts                # Controle de colunas visíveis por perfil
│   ├── spedy.js                  # Tradução Pedido → planilha de NF-e (só scripts usam)
│   └── ceps/                     # Tabela de endereços por DDD, gerada pela raspagem
├── prisma/
│   └── schema.prisma             # Esquema do banco de dados
├── middleware.ts                 # Proteção de rotas autenticadas
├── docs/
│   ├── README.md                 # Índice da documentação
│   ├── sistema.md                # Este documento
│   ├── deploy-vps.md             # Deploy na VPS
│   ├── emissao-nfe-manual.md     # NF-e: como operar
│   └── emissao-nfe-codigo.md     # NF-e: como o código funciona
├── scripts/
│   ├── import-xlsx.js            # Importação do histórico do Google Sheets
│   ├── criar-usuario.js          # Criação de usuários (ADMIN/OPERADOR/PRODUTOR)
│   ├── corrigir-booleanos.js     # Correção de campos booleanos pós-importação
│   ├── teste-fluxo.js            # Simulação do fluxo completo (checkout → pagamento)
│   ├── n8n-portal-nodes.json     # Nós HTTP prontos para importar no n8n
│   ├── gerar-tabela-ddd-cep.js   # NF-e: raspa os endereços por DDD (roda uma vez)
│   ├── marcar-historico-spedy.js # NF-e: backfill do histórico (roda uma vez)
│   ├── gerar-lote-spedy.js       # NF-e: gera o lote da semana
│   └── marcar-lote-spedy.js      # NF-e: confirma o lote importado
└── .env                          # Variáveis de ambiente (nunca commitar)
```

---

## APIs — Referência Rápida

### `POST /api/checkout` — Novo pedido
**Público.** Chamado pelo Netlify quando o cliente conclui o formulário.
```json
{ "id": "pix_char_xxx", "name": "...", "phone": "...", "mail": "...", "plan": "silver", "amount": "27.00", "estilo": "Gospel", "letra": "...", "utm_source": "facebook" }
```

### `POST /api/checkout` — Confirmar pagamento
**Público.** Chamado pelo Netlify após webhook do AbacatePay.
```json
{ "action": "update", "id": "pix_char_xxx" }
```

### `GET /api/checkout?id=xxx` — Buscar dados do pedido
**Público.** Chamado pelo Netlify para obter dados antes de acionar o n8n.

### `POST /api/n8n` — Callback do n8n
**Público com secret.** Chamado pelo n8n para registrar resultados da produção.  
Header obrigatório: `x-callback-secret: <valor do .env>`

| `action` | Efeito |
|---|---|
| `music_ready` | gerou_musica=true + salva links + data_entrega |
| `whats_entregue` | entrega_whatsapp=true |
| `whats_erro` | entrega_whatsapp=false |
| `email_entregue` | entrega_email=true |
| `email_erro` | entrega_email=false |
| `erro_geracao` | gerou_musica=false, status=erro |

### `GET /api/search?q=xxx` — Buscar pedidos
**Autenticado.** Busca por telefone ou email. Retorna campos filtrados por perfil.

### `GET /api/pedido/:id` — Detalhes do pedido
**Autenticado.** Retorna todos os campos visíveis para o perfil do usuário.

### `PATCH /api/pedido/:id` — Editar pedido
**Autenticado.** ADMIN edita qualquer campo; OPERADOR e PRODUTOR editam só `letra` e `estilo`.

### `POST /api/trigger/:id` — Enviar para produção
**Autenticado.** Chama o webhook do n8n pelo backend (nunca expõe a URL no frontend).

---

## Perfis de Acesso

| Campo | ADMIN | OPERADOR | PRODUTOR |
|---|---|---|---|
| Nome, telefone, email | ✅ | ✅ | ✅ |
| Plano, status | ✅ | ✅ | ✅ |
| Estilo, letra | ✅ | ✅ | ✅ |
| Links (página, áudio, mp4) | ✅ | ✅ | ✅ |
| Gerou música, entrega | ✅ | ✅ | ❌ |
| Song ID, data entrega | ✅ | ✅ | ❌ |
| Valor pago | ✅ | ❌ | ❌ |
| UTMs, fbclid, IP | ✅ | ❌ | ❌ |
| Data do pedido | ✅ | ❌ | ❌ |

---

## Banco de Dados — Tabela Pedido

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | String (PK) | ID do PIX (ex: pix_char_xxx) |
| `nome` | String | Nome do cliente |
| `telefone` | String | Telefone (somente números) |
| `email` | String | Email |
| `plano` | String | Plano contratado |
| `status` | String | pendente / pago / concluido / cancelado / erro |
| `estilo` | String? | Estilo musical |
| `letra` | Text? | Letra da música |
| `gerou_musica` | Boolean | Música foi gerada pelo Suno |
| `link_pagina` | String? | Link da página da música |
| `link_basica` | String? | Link básico |
| `link_audio` | String? | Link direto do áudio |
| `link_mp4` | String? | Link do vídeo MP4 |
| `song_id` | String? | ID da música no Suno |
| `data_entrega` | DateTime? | Data em que a música foi gerada |
| `entrega_whatsapp` | Boolean | Entregue via WhatsApp |
| `entrega_email` | Boolean | Entregue via email |
| `valor` | Decimal? | Valor pago |
| `data_pedido` | DateTime? | Data do pedido |
| `utm_source` | String? | Origem da campanha |
| `utm_campaign` | String? | Nome da campanha |
| `utm_medium` | String? | Mídia |
| `utm_content` | String? | Criativo |
| `utm_term` | String? | Termo |
| `utm_id` | String? | ID da campanha |
| `fbclid` | String? | ID do clique Facebook |
| `ip` | String? | IP do cliente |
| `criado_em` | DateTime | Criado automaticamente |
| `atualizado_em` | DateTime | Atualizado automaticamente |

---

## Variáveis de Ambiente (.env)

```env
DATABASE_URL          # Conexão com o PostgreSQL
NEXTAUTH_SECRET       # Chave de assinatura dos tokens de sessão
NEXTAUTH_URL          # URL base do portal (localhost ou domínio da VPS)
N8N_WEBHOOK_URL       # URL do webhook n8n (disparo de produção)
N8N_CALLBACK_SECRET   # Secret para autenticar chamadas do n8n no portal
```

---
