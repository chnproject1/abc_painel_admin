# Deploy na VPS

## 1. Requisitos na VPS
```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# PM2 (gerenciador de processo)
npm install -g pm2
```

## 2. Banco de dados
```bash
sudo -u postgres psql

# Dentro do psql:
CREATE DATABASE abc_music;
CREATE USER abc_user WITH PASSWORD 'senha-segura-aqui';
GRANT ALL PRIVILEGES ON DATABASE abc_music TO abc_user;
\q
```

## 3. Clonar e configurar o projeto
```bash
# Copiar os arquivos para a VPS (via SFTP, scp, ou git)
# Na pasta do projeto:

npm install

# Criar o .env com base no .env.example
cp .env.example .env
nano .env
# Preencher:
#   DATABASE_URL=postgresql://abc_user:senha-segura-aqui@localhost:5432/abc_music
#   NEXTAUTH_SECRET=<resultado de: openssl rand -base64 32>
#   NEXTAUTH_URL=http://IP-DA-VPS:3000
#   N8N_WEBHOOK_URL=<url do webhook n8n>
```

## 4. Criar tabelas e importar dados
```bash
# Criar tabelas no banco
npm run db:push

# Criar usuário admin
node scripts/criar-usuario.js seuemail@gmail.com suasenha "Seu Nome" ADMIN

# Criar usuário operador (para funcionário)
node scripts/criar-usuario.js operador@email.com senha123 "Nome do Operador" OPERADOR

# Importar dados do XLSX (primeira vez)
node scripts/import-xlsx.js /caminho/para/CORRECAO.xlsx
```

## 5. Build e iniciar com PM2
```bash
npm run build

pm2 start npm --name "abc-music-admin" -- start
pm2 save
pm2 startup  # para iniciar automaticamente no boot
```

## 6. (Opcional) Nginx como proxy reverso
```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Sincronizar com Google Sheets (transição)

A forma mais simples é usar o n8n que você já tem:

1. Crie um workflow no n8n com trigger **Schedule** (ex: a cada 6h)
2. Use o node **Google Sheets** para ler as novas linhas
3. Use o node **HTTP Request** para fazer POST em `/api/pedido/{id}` com os campos atualizados

Ou simplesmente exporte o Sheets como XLSX e rode o script de import novamente — ele faz `upsert` (atualiza se já existe, cria se não existe).

## Comandos úteis
```bash
pm2 logs abc-music-admin    # ver logs
pm2 restart abc-music-admin # reiniciar
npm run db:studio           # interface visual do banco (abrir no browser local)
```
