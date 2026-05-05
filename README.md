# Guia de Instalação - SábioStore Bot

## Requisitos
- VPS com AlmaLinux / CentOS / RHEL
- Mínimo 1GB RAM
- Acesso root via SSH (Putty)

---

## Passo 1: Conectar na VPS via Putty

1. Abra o Putty
2. Em "Host Name": `108.174.151.245`
3. Em "Port": `22022`
4. Clique em "Open"
5. Login: `root`
6. Senha: (sua senha)

---

## Passo 2: Instalar Node.js e Dependências

Execute os comandos abaixo um por um:

```bash
# Atualizar sistema
dnf update -y

# Instalar dependências
dnf install -y curl git gcc-c++ make python3

# Instalar Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# Verificar instalação
node -v
npm -v

# Instalar PM2 (gerenciador de processos)
npm install -g pm2
```

---

## Passo 3: Baixar o Projeto

### Opção A: Via GitHub (Recomendado)
```bash
cd /opt
git clone https://github.com/erickmachine/sabiostore.git sabiostore
cd sabiostore
```

### Opção B: Upload Manual
1. Use WinSCP ou FileZilla para conectar na VPS
2. Faça upload da pasta `bot` para `/opt/sabiostore`

---

## Passo 4: Configurar o Projeto

```bash
cd /opt/sabiostore

# Instalar dependências
npm install

# Criar diretórios
mkdir -p data/auth

# Copiar e editar configurações
cp .env.example .env
nano .env
```

### Configurar o arquivo .env:
```
MP_ACCESS_TOKEN=SEU_TOKEN_DO_MERCADO_PAGO
PORT=3000
JWT_SECRET=uma-chave-secreta-qualquer-123
NODE_ENV=production
```

**Para obter o token do MercadoPago:**
1. Acesse: https://www.mercadopago.com.br/developers/panel/app
2. Crie uma aplicação ou selecione existente
3. Vá em "Credenciais de produção"
4. Copie o "Access Token"

Salve o arquivo: `Ctrl+X`, depois `Y`, depois `Enter`

---

## Passo 5: Configurar Firewall

```bash
# Abrir porta do painel admin
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload
```

---

## Passo 6: Iniciar o Bot

```bash
cd /opt/sabiostore

# Iniciar com PM2
pm2 start ecosystem.config.js

# Ver logs do bot (QR Code aparecerá aqui)
pm2 logs sabiostore-bot
```

---

## Passo 7: Escanear QR Code

1. Quando executar `pm2 logs sabiostore-bot`, um QR Code aparecerá
2. Abra o WhatsApp no celular
3. Vá em Configurações > Aparelhos Conectados > Conectar Aparelho
4. Escaneie o QR Code

---

## Passo 8: Acessar Painel Admin

1. Abra o navegador
2. Acesse: `http://108.174.151.245:3000`
3. Login padrão:
   - Usuário: `admin`
   - Senha: `admin123`

**IMPORTANTE:** Troque a senha após o primeiro acesso!

---

## Comandos Úteis

```bash
# Ver status dos processos
pm2 status

# Ver logs do bot
pm2 logs sabiostore-bot

# Ver logs do painel
pm2 logs sabiostore-panel

# Reiniciar bot
pm2 restart sabiostore-bot

# Parar tudo
pm2 stop all

# Iniciar tudo
pm2 start all

# Configurar para iniciar no boot
pm2 startup
pm2 save
```

---

## Comandos do Bot (WhatsApp)

### Usuários
- `/menu` - Ver menu principal
- `/estoque` - Ver produtos disponíveis
- `/saldo` - Ver saldo atual
- `/pix 10` - Gerar PIX de R$10
- `/comprar 1` - Comprar produto ID 1
- `/meuspedidos` - Ver histórico de compras
- `/suporte Mensagem` - Abrir ticket de suporte
- `/feedback Mensagem` - Enviar feedback

### Administradores
- `/admin` - Menu admin
- `/addproduto Nome|Desc|Preço|Categoria` - Adicionar produto
- `/addestoque 1 conteudo` - Adicionar item ao estoque do produto 1
- `/delproduto 1` - Remover produto
- `/stats` - Ver estatísticas
- `/addsaldo 5511999999999 50` - Adicionar R$50 ao usuário
- `/usuarios` - Listar usuários
- `/vendas` - Ver vendas
- `/tickets` - Ver tickets de suporte
- `/feedbacks` - Ver feedbacks
- `/broadcast Mensagem` - Enviar para todos os usuários

---

## Solução de Problemas

### Bot não conecta
```bash
# Remover sessão antiga
rm -rf /opt/sabiostore/data/auth/*

# Reiniciar bot
pm2 restart sabiostore-bot

# Ver QR Code novamente
pm2 logs sabiostore-bot
```

### Erro de permissão
```bash
chown -R root:root /opt/sabiostore
chmod -R 755 /opt/sabiostore
```

### Painel não abre
```bash
# Verificar se está rodando
pm2 status

# Verificar firewall
firewall-cmd --list-ports

# Reiniciar painel
pm2 restart sabiostore-panel
```

### PIX não funciona
1. Verifique se o token do MercadoPago está correto no `.env`
2. Verifique se a aplicação no MercadoPago está ativa
3. Reinicie o bot após alterar o `.env`:
```bash
pm2 restart sabiostore-bot
```

---

## Atualizar o Bot

```bash
cd /opt/sabiostore

# Se usar GitHub
git pull origin main

# Reinstalar dependências
npm install

# Reiniciar
pm2 restart all
```

---

## Backup

```bash
# Fazer backup do banco de dados
cp /opt/sabiostore/data/sabiostore.db /root/backup_$(date +%Y%m%d).db

# Fazer backup da sessão WhatsApp
tar -czf /root/auth_backup_$(date +%Y%m%d).tar.gz /opt/sabiostore/data/auth/
```

---

## Contato e Suporte

- GitHub: https://github.com/erickmachine/sabiostore
- Administradores:
  - +55 71 99300-3691
  - +1 289 435-1530
