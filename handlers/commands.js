const db = require('../database/operations');
const { createPixPayment } = require('../services/mercadopago');

const userStates = new Map();

function formatMoney(value) {
  return `R$${value.toFixed(2).replace('.', ',')}`;
}

function formatPhone(phone) {
  return phone.replace(/\D/g, '');
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr + 'T' + (timeStr || '00:00:00'));
  return date.toLocaleString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==================== COMANDOS PUBLICOS ====================

async function handleMenu(sock, sender) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const botName = db.getSetting('bot_name') || 'SabioStore';
  
  const menu = `
*${botName}*

Ola! Seja bem-vindo(a)!

Seu saldo: *${formatMoney(user.balance)}*

*COMANDOS*

/estoque - Ver produtos
/categorias - Ver categorias
/saldo - Ver seu saldo
/pix <valor> - Adicionar saldo
/comprar <id> - Comprar produto
/meuspedidos - Ver compras
/suporte <msg> - Abrir ticket
/feedback <msg> - Enviar feedback
/menu - Ver este menu
`.trim();

  await sock.sendMessage(sender, { text: menu });
}

async function handleCategorias(sock, sender) {
  const categories = db.getCategories(true);
  
  if (categories.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhuma categoria disponivel.' });
    return;
  }

  let message = '*CATEGORIAS DISPONIVEIS*\n\n';

  for (const cat of categories) {
    const products = db.getProductsByCategory(cat.id);
    message += `*${cat.name}*\n`;
    if (cat.description) message += `   ${cat.description}\n`;
    message += `   ${products.length} produto(s)\n\n`;
  }

  message += '\nDigite /estoque para ver todos os produtos.';

  await sock.sendMessage(sender, { text: message });
}

async function handleEstoque(sock, sender, args) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const products = db.getProducts(true);
  
  if (products.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum produto disponivel no momento.' });
    return;
  }

  let message = `*ESTOQUE*\n\nOla! Seu saldo: *${formatMoney(user.balance)}*\n`;

  // Agrupar por categoria
  const categories = {};
  for (const product of products) {
    const cat = product.category || 'Geral';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(product);
  }

  for (const [category, prods] of Object.entries(categories)) {
    message += `\n*${category}*\n`;
    message += '-------------------\n';
    
    for (const product of prods) {
      const stockCount = db.getProductStock(product.id);
      
      message += `\n*${product.id}. ${product.name}*\n`;
      if (product.description1) message += `   ${product.description1}\n`;
      if (product.description2) message += `   ${product.description2}\n`;
      if (product.description3) message += `   ${product.description3}\n`;
      if (product.description4) message += `   ${product.description4}\n`;
      message += `   Estoque: ${stockCount}\n`;
      message += `   Valor: *${formatMoney(product.price)}*\n`;
      message += `   /comprar ${product.id}\n`;
    }
  }

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleSaldo(sock, sender) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  
  const message = `*SEU SALDO*

Saldo atual: *${formatMoney(user.balance)}*

Para adicionar saldo:
/pix <valor>

Exemplo: /pix 10`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handlePix(sock, sender, args) {
  const amount = parseFloat(args[0]?.replace(',', '.'));
  
  if (!amount || isNaN(amount) || amount < 1) {
    await sock.sendMessage(sender, { 
      text: 'Valor invalido. Use: /pix <valor>\nExemplo: /pix 10\n\nValor minimo: R$1,00' 
    });
    return;
  }

  if (amount > 1000) {
    await sock.sendMessage(sender, { 
      text: 'Valor maximo por transacao: R$1.000,00' 
    });
    return;
  }

  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const pixKey = db.getSetting('pix_key') || 'patinhasqueprecisam@gmail.com';

  try {
    await sock.sendMessage(sender, { text: 'Gerando pagamento PIX...' });
    
    const payment = await createPixPayment(amount, `SabioStore - Saldo para ${formatPhone(sender)}`);
    
    db.createPayment(
      formatPhone(sender),
      amount,
      payment.id.toString(),
      payment.qr_code,
      payment.qr_code_base64
    );

    const message = `*PAGAMENTO PIX*

Valor: *${formatMoney(amount)}*

*Chave PIX (Email):*
${pixKey}

*Codigo PIX Copia e Cola:*

\`\`\`
${payment.qr_code}
\`\`\`

Este codigo expira em 30 minutos.
Apos o pagamento, seu saldo sera creditado automaticamente!`.trim();

    await sock.sendMessage(sender, { text: message });

    // Enviar QR Code como imagem
    if (payment.qr_code_base64) {
      const imageBuffer = Buffer.from(payment.qr_code_base64, 'base64');
      await sock.sendMessage(sender, { 
        image: imageBuffer,
        caption: 'QR Code PIX - Escaneie para pagar'
      });
    }

  } catch (error) {
    console.error('Error creating PIX:', error);
    await sock.sendMessage(sender, { 
      text: 'Erro ao gerar pagamento. Tente novamente mais tarde.' 
    });
  }
}

async function handleComprar(sock, sender, args) {
  const productId = parseInt(args[0]);
  const quantity = parseInt(args[1]) || 1;
  
  if (!productId) {
    await sock.sendMessage(sender, { 
      text: 'Use: /comprar <id do produto> [quantidade]\nExemplo: /comprar 1' 
    });
    return;
  }

  const product = db.getProduct(productId);
  if (!product || !product.is_active) {
    await sock.sendMessage(sender, { text: 'Produto nao encontrado.' });
    return;
  }

  const availableStock = db.getProductStock(productId);
  if (availableStock < quantity) {
    await sock.sendMessage(sender, { 
      text: `Estoque insuficiente. Disponivel: ${availableStock}` 
    });
    return;
  }

  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const totalPrice = product.price * quantity;

  if (user.balance < totalPrice) {
    await sock.sendMessage(sender, { 
      text: `Saldo insuficiente!\n\nSeu saldo: ${formatMoney(user.balance)}\nPreco total: ${formatMoney(totalPrice)}\n\nAdicione saldo com /pix ${Math.ceil(totalPrice - user.balance)}` 
    });
    return;
  }

  const stockItems = db.getAvailableStockItems(productId, quantity);
  if (stockItems.length < quantity) {
    await sock.sendMessage(sender, { text: 'Erro ao processar compra. Tente novamente.' });
    return;
  }

  // Marcar itens como vendidos
  db.markStockItemsSold(stockItems.map(i => i.id), formatPhone(sender));
  
  // Debitar saldo
  db.updateUserBalance(formatPhone(sender), -totalPrice);
  
  // Registrar compra com horario
  const itemContents = stockItems.map(i => i.content);
  db.createPurchase(formatPhone(sender), productId, quantity, totalPrice, itemContents);

  // Atualizar quantidade
  db.updateProduct(productId, { quantity: availableStock - quantity });

  // Horario da compra
  const now = new Date();
  const purchaseTime = now.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let deliveryMessage = `*COMPRA REALIZADA*

Produto: ${product.name}
Quantidade: ${quantity}
Total: ${formatMoney(totalPrice)}
Novo saldo: ${formatMoney(user.balance - totalPrice)}

Data/Hora: ${purchaseTime}

*Seus itens:*
`;

  for (let i = 0; i < itemContents.length; i++) {
    deliveryMessage += `\n${i + 1}. \`${itemContents[i]}\``;
  }

  deliveryMessage += '\n\nObrigado pela compra!';

  await sock.sendMessage(sender, { text: deliveryMessage });

  checkLowStock(sock);
}

async function handleMeusPedidos(sock, sender) {
  const purchases = db.getUserPurchases(formatPhone(sender));
  
  if (purchases.length === 0) {
    await sock.sendMessage(sender, { text: 'Voce ainda nao fez nenhuma compra.' });
    return;
  }

  let message = `*SUAS COMPRAS*\n`;

  for (const purchase of purchases.slice(0, 10)) {
    const dateTime = formatDateTime(purchase.purchase_date, purchase.purchase_time);
    message += `\n*${purchase.product_name}*`;
    message += `\n   Qtd: ${purchase.quantity} | Total: ${formatMoney(purchase.total_price)}`;
    message += `\n   Data/Hora: ${dateTime}\n`;
  }

  if (purchases.length > 10) {
    message += `\n... e mais ${purchases.length - 10} compra(s)`;
  }

  await sock.sendMessage(sender, { text: message });
}

async function handleSuporte(sock, sender, args) {
  const message = args.join(' ');
  
  if (!message) {
    await sock.sendMessage(sender, { 
      text: 'Use: /suporte <sua mensagem>\nExemplo: /suporte Preciso de ajuda com minha compra' 
    });
    return;
  }

  db.createSupportTicket(formatPhone(sender), message);
  
  await sock.sendMessage(sender, { 
    text: 'Ticket de suporte criado com sucesso!\n\nUm administrador respondera em breve.' 
  });

  await notifyAdmins(sock, `*Novo Ticket de Suporte*\n\nDe: ${sender}\nMensagem: ${message}`);
}

async function handleFeedback(sock, sender, args) {
  const message = args.join(' ');
  
  if (!message) {
    await sock.sendMessage(sender, { 
      text: 'Use: /feedback <sua mensagem>\nExemplo: /feedback Otimo atendimento!' 
    });
    return;
  }

  db.createFeedback(formatPhone(sender), message);
  
  await sock.sendMessage(sender, { 
    text: 'Feedback enviado com sucesso!\n\nAgradecemos sua opiniao!' 
  });

  await notifyAdmins(sock, `*Novo Feedback*\n\nDe: ${sender}\nMensagem: ${message}`);
}

// ==================== COMANDOS ADMIN ====================

async function handleAdminMenu(sock, sender) {
  const menu = `*MENU ADMIN*

*PRODUTOS*
/addproduto - Adicionar produto
/editproduto <id> - Editar produto
/delproduto <id> - Remover produto
/addestoque <id> - Add itens estoque
/addbanner <id> <url> - Add banner

*CATEGORIAS*
/addcategoria <nome> - Criar categoria
/listcategorias - Listar categorias
/delcategoria <id> - Remover categoria

*USUARIOS*
/usuarios - Listar usuarios
/addsaldo <num> <valor> - Add saldo
/setadmin <num> - Tornar admin

*RELATORIOS*
/stats - Estatisticas
/vendas - Ver vendas
/tickets - Ver tickets
/feedbacks - Ver feedbacks

*CONFIG*
/broadcast <msg> - Enviar para todos
/config - Ver configuracoes`.trim();

  await sock.sendMessage(sender, { text: menu });
}

async function handleAddCategoria(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const name = args.join(' ');
  if (!name) {
    await sock.sendMessage(sender, { text: 'Use: /addcategoria <nome>\nExemplo: /addcategoria Streaming' });
    return;
  }

  const id = db.createCategory(name);
  await sock.sendMessage(sender, { text: `Categoria "${name}" criada com ID: ${id}` });
}

async function handleListCategorias(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const categories = db.getCategories(false);
  
  if (categories.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhuma categoria cadastrada.' });
    return;
  }

  let message = '*CATEGORIAS*\n';
  for (const cat of categories) {
    const status = cat.is_active ? '' : ' (inativa)';
    message += `\n${cat.id}. ${cat.name}${status}`;
    if (cat.banner_url) message += ' [banner]';
  }

  await sock.sendMessage(sender, { text: message });
}

async function handleDelCategoria(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const id = parseInt(args[0]);
  if (!id) {
    await sock.sendMessage(sender, { text: 'Use: /delcategoria <id>' });
    return;
  }

  db.deleteCategory(id);
  await sock.sendMessage(sender, { text: `Categoria ${id} removida.` });
}

async function handleAddBanner(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const productId = parseInt(args[0]);
  const bannerUrl = args[1];

  if (!productId || !bannerUrl) {
    await sock.sendMessage(sender, { text: 'Use: /addbanner <id_produto> <url_imagem>' });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: 'Produto nao encontrado.' });
    return;
  }

  db.updateProduct(productId, { banner_url: bannerUrl });
  await sock.sendMessage(sender, { text: `Banner adicionado ao produto "${product.name}"!` });
}

async function handleAddProduto(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  // Formato: /addproduto Nome|Desc1|Desc2|Preco|Categoria
  const data = args.join(' ').split('|').map(s => s.trim());
  
  if (data.length < 2) {
    await sock.sendMessage(sender, { 
      text: 'Use: /addproduto Nome|Descricao1|Descricao2|Preco|Categoria\n\nExemplo:\n/addproduto Netflix Premium|30 dias|Entrega automatica|29.90|Streaming' 
    });
    return;
  }

  const price = parseFloat(data.find(d => !isNaN(parseFloat(d.replace(',', '.'))))?.replace(',', '.') || '0');
  
  if (price <= 0) {
    await sock.sendMessage(sender, { text: 'Preco invalido.' });
    return;
  }

  const productData = {
    name: data[0],
    description1: data[1] || null,
    description2: data[2] && isNaN(parseFloat(data[2])) ? data[2] : null,
    description3: data[3] && isNaN(parseFloat(data[3])) ? data[3] : null,
    description4: data[4] && isNaN(parseFloat(data[4])) ? data[4] : null,
    price: price,
    category: data[data.length - 1] && isNaN(parseFloat(data[data.length - 1])) && data[data.length - 1] !== data[0] ? data[data.length - 1] : 'Geral',
  };

  const productId = db.createProduct(productData);
  
  await sock.sendMessage(sender, { 
    text: `Produto criado com sucesso!\n\nID: ${productId}\nNome: ${productData.name}\nPreco: ${formatMoney(productData.price)}\nCategoria: ${productData.category}\n\nAdicione estoque com:\n/addestoque ${productId} <conteudo>` 
  });
}

async function handleAddEstoque(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const productId = parseInt(args[0]);
  const content = args.slice(1).join(' ');
  
  if (!productId || !content) {
    await sock.sendMessage(sender, { 
      text: 'Use: /addestoque <id> <conteudo>\n\nPara multiplos itens, separe por linha:\n/addestoque 1 conta1@email.com\nconta2@email.com\nconta3@email.com' 
    });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: 'Produto nao encontrado.' });
    return;
  }

  const items = content.split('\n').filter(i => i.trim());
  
  if (items.length > 1) {
    db.addStockItems(productId, items);
    await sock.sendMessage(sender, { 
      text: `${items.length} itens adicionados ao estoque de "${product.name}"!` 
    });
  } else {
    db.addStockItem(productId, content);
    await sock.sendMessage(sender, { 
      text: `Item adicionado ao estoque de "${product.name}"!` 
    });
  }
}

async function handleDelProduto(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const productId = parseInt(args[0]);
  if (!productId) {
    await sock.sendMessage(sender, { text: 'Use: /delproduto <id>' });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: 'Produto nao encontrado.' });
    return;
  }

  db.deleteProduct(productId);
  await sock.sendMessage(sender, { text: `Produto "${product.name}" removido!` });
}

async function handleStats(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const stats = db.getStats();
  
  const message = `*ESTATISTICAS*

Usuarios: ${stats.totalUsers}
Produtos ativos: ${stats.totalProducts}
Categorias: ${stats.totalCategories}
Total de vendas: ${stats.totalPurchases}
Receita total: ${formatMoney(stats.totalRevenue)}

*HOJE*
Vendas: ${stats.todaySales}
Receita: ${formatMoney(stats.todayRevenue)}

Pagamentos pendentes: ${stats.pendingPayments}
Tickets abertos: ${stats.openTickets}
Feedbacks pendentes: ${stats.pendingFeedbacks}`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handleAddSaldo(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const phone = formatPhone(args[0] || '');
  const amount = parseFloat(args[1]?.replace(',', '.'));

  if (!phone || !amount || isNaN(amount)) {
    await sock.sendMessage(sender, { 
      text: 'Use: /addsaldo <numero> <valor>\nExemplo: /addsaldo 5511999999999 50' 
    });
    return;
  }

  db.createUser(phone);
  const user = db.updateUserBalance(phone, amount);
  
  await sock.sendMessage(sender, { 
    text: `Saldo adicionado!\n\nNumero: ${phone}\nValor: ${formatMoney(amount)}\nNovo saldo: ${formatMoney(user.balance)}` 
  });
}

async function handleUsuarios(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const users = db.getAllUsers();
  
  let message = `*USUARIOS (${users.length})*\n`;

  for (const user of users.slice(0, 20)) {
    const admin = user.is_admin ? ' [ADMIN]' : '';
    message += `\n${user.phone}${admin}\n   Saldo: ${formatMoney(user.balance)}\n`;
  }

  if (users.length > 20) {
    message += `\n... e mais ${users.length - 20} usuarios`;
  }

  await sock.sendMessage(sender, { text: message });
}

async function handleTickets(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const tickets = db.getOpenSupportTickets();
  
  if (tickets.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum ticket aberto.' });
    return;
  }

  let message = `*TICKETS ABERTOS (${tickets.length})*\n`;

  for (const ticket of tickets) {
    const date = new Date(ticket.created_at).toLocaleString('pt-BR');
    message += `\nID: ${ticket.id}\n${ticket.phone}\n${ticket.message}\n${date}\n`;
  }

  message += '\nResponda com:\n/respticket <id> <mensagem>';

  await sock.sendMessage(sender, { text: message });
}

async function handleRespTicket(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const ticketId = parseInt(args[0]);
  const response = args.slice(1).join(' ');

  if (!ticketId || !response) {
    await sock.sendMessage(sender, { text: 'Use: /respticket <id> <resposta>' });
    return;
  }

  db.respondSupportTicket(ticketId, response);
  await sock.sendMessage(sender, { text: `Ticket #${ticketId} respondido!` });
}

async function handleFeedbacks(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const feedbacks = db.getAllFeedbacks();
  
  if (feedbacks.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum feedback recebido.' });
    return;
  }

  let message = `*FEEDBACKS (${feedbacks.length})*\n`;

  for (const fb of feedbacks.slice(0, 10)) {
    const date = new Date(fb.created_at).toLocaleString('pt-BR');
    const status = fb.status === 'pending' ? '[pendente]' : '[respondido]';
    message += `\n${status} ID: ${fb.id}\n${fb.phone}\n${fb.message}\n${date}\n`;
  }

  await sock.sendMessage(sender, { text: message });
}

async function handleBroadcast(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const message = args.join(' ');
  if (!message) {
    await sock.sendMessage(sender, { text: 'Use: /broadcast <mensagem>' });
    return;
  }

  const users = db.getAllUsers();
  let sent = 0;

  for (const user of users) {
    try {
      await sock.sendMessage(`${user.phone}@s.whatsapp.net`, { 
        text: `*Mensagem do SabioStore*\n\n${message}` 
      });
      sent++;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`Error sending to ${user.phone}:`, e.message);
    }
  }

  await sock.sendMessage(sender, { text: `Mensagem enviada para ${sent} usuarios!` });
}

async function handleVendas(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const purchases = db.getAllPurchases();
  
  if (purchases.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhuma venda realizada.' });
    return;
  }

  let message = `*VENDAS (${purchases.length})*\n`;

  let total = 0;
  for (const p of purchases.slice(0, 15)) {
    const dateTime = formatDateTime(p.purchase_date, p.purchase_time);
    message += `\n${p.product_name}\n${p.phone}\n${formatMoney(p.total_price)}\n${dateTime}\n`;
    total += p.total_price;
  }

  message += `\n-------------------\nTotal: ${formatMoney(total)}`;

  await sock.sendMessage(sender, { text: message });
}

// ==================== HELPERS ====================

async function checkLowStock(sock) {
  const lowStockProducts = db.getLowStockProducts();
  
  if (lowStockProducts.length > 0) {
    let alertMessage = '*ALERTA DE ESTOQUE BAIXO*\n\n';
    for (const p of lowStockProducts) {
      alertMessage += `${p.name}: ${p.available_stock} unidades\n`;
    }
    await notifyAdmins(sock, alertMessage);
  }
}

async function notifyAdmins(sock, message) {
  const admins = db.getAllUsers().filter(u => u.is_admin);
  
  for (const admin of admins) {
    try {
      await sock.sendMessage(`${admin.phone}@s.whatsapp.net`, { text: message });
    } catch (e) {
      console.error(`Error notifying admin ${admin.phone}:`, e.message);
    }
  }
}

// ==================== MAIN HANDLER ====================

async function handleMessage(sock, sender, message) {
  const text = message.trim();
  
  if (sender.includes('@g.us')) return;
  
  db.createUser(formatPhone(sender));
  
  if (!text.startsWith('/')) {
    const botName = db.getSetting('bot_name') || 'SabioStore';
    await sock.sendMessage(sender, { 
      text: `Ola! Bem-vindo ao *${botName}*!\n\nDigite /menu para ver os comandos disponiveis.` 
    });
    return;
  }

  const [command, ...args] = text.slice(1).split(' ');
  const cmd = command.toLowerCase();
  const isUserAdmin = db.isAdmin(formatPhone(sender));

  switch (cmd) {
    case 'menu':
    case 'start':
    case 'inicio':
      await handleMenu(sock, sender);
      break;
    case 'categorias':
      await handleCategorias(sock, sender);
      break;
    case 'estoque':
    case 'produtos':
    case 'loja':
      await handleEstoque(sock, sender, args);
      break;
    case 'saldo':
      await handleSaldo(sock, sender);
      break;
    case 'pix':
    case 'depositar':
    case 'deposito':
      await handlePix(sock, sender, args);
      break;
    case 'comprar':
    case 'buy':
      await handleComprar(sock, sender, args);
      break;
    case 'meuspedidos':
    case 'pedidos':
    case 'compras':
      await handleMeusPedidos(sock, sender);
      break;
    case 'suporte':
    case 'ajuda':
    case 'help':
      await handleSuporte(sock, sender, args);
      break;
    case 'feedback':
      await handleFeedback(sock, sender, args);
      break;
    
    // Admin commands
    case 'admin':
      if (isUserAdmin) await handleAdminMenu(sock, sender);
      else await sock.sendMessage(sender, { text: 'Sem permissao.' });
      break;
    case 'addcategoria':
      await handleAddCategoria(sock, sender, args);
      break;
    case 'listcategorias':
      await handleListCategorias(sock, sender);
      break;
    case 'delcategoria':
      await handleDelCategoria(sock, sender, args);
      break;
    case 'addbanner':
      await handleAddBanner(sock, sender, args);
      break;
    case 'addproduto':
      await handleAddProduto(sock, sender, args);
      break;
    case 'addestoque':
    case 'abastecer':
      await handleAddEstoque(sock, sender, args);
      break;
    case 'delproduto':
      await handleDelProduto(sock, sender, args);
      break;
    case 'stats':
    case 'estatisticas':
      await handleStats(sock, sender);
      break;
    case 'addsaldo':
      await handleAddSaldo(sock, sender, args);
      break;
    case 'usuarios':
    case 'users':
      await handleUsuarios(sock, sender);
      break;
    case 'tickets':
      await handleTickets(sock, sender);
      break;
    case 'respticket':
      await handleRespTicket(sock, sender, args);
      break;
    case 'feedbacks':
      await handleFeedbacks(sock, sender);
      break;
    case 'broadcast':
      await handleBroadcast(sock, sender, args);
      break;
    case 'vendas':
      await handleVendas(sock, sender);
      break;
    
    default:
      await sock.sendMessage(sender, { text: 'Comando nao reconhecido. Digite /menu para ver os comandos.' });
  }
}

module.exports = { handleMessage, notifyAdmins };
