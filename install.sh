#!/bin/bash

# SábioStore Bot - Script de Instalação para VPS
# Compatível com AlmaLinux / CentOS / RHEL

echo "================================================"
echo "   SábioStore Bot - Instalador Automático"
echo "================================================"
echo ""

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then
  echo "Por favor, execute como root (sudo)"
  exit 1
fi

# Atualizar sistema
echo "[1/6] Atualizando sistema..."
dnf update -y

# Instalar dependências do sistema
echo "[2/6] Instalando dependências..."
dnf install -y curl git gcc-c++ make python3

# Instalar Node.js 20
echo "[3/6] Instalando Node.js 20..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# Verificar instalação
node -v
npm -v

# Instalar PM2 globalmente
echo "[4/6] Instalando PM2..."
npm install -g pm2

# Criar diretório do projeto
echo "[5/6] Configurando projeto..."
mkdir -p /opt/sabiostore
cd /opt/sabiostore

# Copiar arquivos (assumindo que o script está na pasta do projeto)
# Se estiver usando Git:
# git clone https://github.com/erickmachine/sabiostore.git .

# Instalar dependências do projeto
echo "[6/6] Instalando dependências do projeto..."
npm install

# Criar arquivo .env se não existir
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "================================================"
  echo "IMPORTANTE: Configure seu token do MercadoPago"
  echo "Edite o arquivo /opt/sabiostore/.env"
  echo "================================================"
fi

# Criar diretórios de dados
mkdir -p data/auth

# Configurar PM2 para iniciar no boot
pm2 startup
pm2 save

# Abrir portas no firewall
echo "Configurando firewall..."
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload

echo ""
echo "================================================"
echo "   Instalação concluída!"
echo "================================================"
echo ""
echo "Próximos passos:"
echo "1. Edite o arquivo .env com seu token do MercadoPago:"
echo "   nano /opt/sabiostore/.env"
echo ""
echo "2. Inicie o bot:"
echo "   cd /opt/sabiostore && pm2 start ecosystem.config.js"
echo ""
echo "3. Escaneie o QR Code que aparecerá no terminal:"
echo "   pm2 logs sabiostore-bot"
echo ""
echo "4. Acesse o painel admin:"
echo "   http://SEU_IP:3000"
echo "   Usuário: admin"
echo "   Senha: admin123"
echo ""
echo "================================================"
