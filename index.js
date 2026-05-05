require('dotenv').config();

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const { initDatabase } = require('./database/schema');
const db = require('./database/operations');
const { handleMessage, notifyAdmins } = require('./handlers/commands');
const { initMercadoPago, checkPaymentStatus } = require('./services/mercadopago');

const CONFIG = {
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN || '',
  PIX_KEY: process.env.PIX_KEY || '',
  BOT_NUMBER: '5571982900895',
  DATA_DIR: path.join(__dirname, 'data'),
  AUTH_DIR: path.join(__dirname, 'data', 'auth'),
};

if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CONFIG.AUTH_DIR)) {
  fs.mkdirSync(CONFIG.AUTH_DIR, { recursive: true });
}

const logger = pino({ level: 'silent' });

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

// Anti-detection: Random delays
function randomDelay(min = 1000, max = 3000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function startBot() {
  console.log('========================================');
  console.log('Iniciando SabioStore Bot...');
  console.log('Tentativa: ' + (reconnectAttempts + 1));
  console.log('========================================');
  
  initDatabase();
  console.log('Banco de dados inicializado');
  
  if (CONFIG.MP_ACCESS_TOKEN) {
    initMercadoPago(CONFIG.MP_ACCESS_TOKEN);
    console.log('MercadoPago inicializado');
    startPaymentChecker();
  } else {
    console.log('MP_ACCESS_TOKEN nao configurado. Pagamentos PIX desativados.');
  }

  const { version } = await fetchLatestBaileysVersion();
  console.log('WA versao: ' + version.join('.'));

  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_DIR);
  
  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['SabioStore', 'Safari', '3.0'],
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    qrTimeout: 40000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 30000,
    emitOwnEvents: false,
    markOnlineOnConnect: false,
    retryRequestDelayMs: 2000,
    fireInitQueries: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n========================================');
      console.log('ESCANEIE O QR CODE COM SEU WHATSAPP:');
      console.log('========================================\n');
      qrcode.generate(qr, { small: true });
      reconnectAttempts = 0;
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log('Conexao fechada. Status:', statusCode || 'unknown');
      
      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        const delayTime = Math.min(reconnectAttempts * 10000, 60000);
        console.log('Reconectando em ' + (delayTime/1000) + 's... (tentativa ' + reconnectAttempts + '/' + MAX_RECONNECT + ')');
        await delay(delayTime);
        startBot();
      } else if (reconnectAttempts >= MAX_RECONNECT) {
        console.log('Maximo de tentativas. Execute: pm2 restart sabiostore-bot');
        reconnectAttempts = 0;
      } else {
        console.log('Deslogado. Execute: rm -rf data/auth && pm2 restart sabiostore-bot');
      }
    } else if (connection === 'open') {
      console.log('========================================');
      console.log('BOT CONECTADO COM SUCESSO!');
      console.log('========================================');
      reconnectAttempts = 0;
      
      await delay(5000);
      await notifyAdmins(sock, 'SabioStore Bot esta online!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        
        const messageContent = msg.message?.conversation 
          || msg.message?.extendedTextMessage?.text
          || msg.message?.imageMessage?.caption
          || '';
        
        if (!messageContent) continue;
        
        const sender = msg.key.remoteJid;
        console.log('Mensagem de ' + sender + ': ' + messageContent);
        
        await delay(randomDelay(500, 2000));
        
        await handleMessage(sock, sender, messageContent);
      } catch (error) {
        console.error('Erro ao processar mensagem:', error);
      }
    }
  });

  return sock;
}

async function startPaymentChecker() {
  setInterval(async () => {
    try {
      const pendingPayments = db.getPendingPayments();
      
      for (const payment of pendingPayments) {
        try {
          const status = await checkPaymentStatus(payment.payment_id);
          
          if (status.status === 'approved') {
            db.updatePaymentStatus(payment.payment_id, 'approved');
            const user = db.updateUserBalance(payment.phone, payment.amount);
            
            if (sock) {
              await delay(randomDelay(1000, 3000));
              await sock.sendMessage(payment.phone + '@s.whatsapp.net', {
                text: '*Pagamento Confirmado!*\n\nValor: R$' + payment.amount.toFixed(2) + '\nNovo saldo: R$' + user.balance.toFixed(2) + '\n\nObrigado pela compra!'
              });
            }
          } else if (status.status === 'cancelled' || status.status === 'rejected') {
            db.updatePaymentStatus(payment.payment_id, status.status);
          }
        } catch (e) {}
      }
    } catch (error) {}
  }, 20000);
}

startBot().catch(console.error);

process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
