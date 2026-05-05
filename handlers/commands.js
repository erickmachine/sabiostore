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
╔════════════════════════╗
║  *${botName}*     
╠════════════════════════╣
║ Olá! Seja bem-vindo(a)!
║ 
║ Seu saldo: *${formatMoney(user.balance)}*
╠════════════════════════╣
║ COMANDOS
║
║ /estoque - Ver produtos
║ /saldo - Ver seu saldo
║ /pix <valor> - Adicionar saldo
║ /comprar <id> - Comprar produto
║ /meuspedidos - Ver compras
║ /suporte <msg> - Abrir ticket
║ /feedback <msg> - Enviar feedback
║ /menu - Ver este menu
╚════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: menu });
}

async function handleCategorias(sock, sender) {
  const categories = db.getCategories(true);
  
  if (categories.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhuma categoria disponivel.' });
    return;
  }

  let message = `
╔════════════════════════╗
║     *CATEGORIAS*       
╠════════════════════════╣`;

  for (const cat of categories) {
    const products = db.getProductsByCategory(cat.id);
    message += `
║ 
║ *${cat.name}*`;
    if (cat.description) {
      message += `
║ ${cat.description}`;
    }
    message += `
║ ${products.length} produto(s)`;
  }

  message += `
║ 
╠════════════════════════╣
║ Digite /estoque para ver
║ todos os produtos       
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleEstoque(sock, sender, args) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const products = db.getProducts(true);
  
  if (products.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum produto disponivel no momento.' });
    return;
  }

  let message = `
╔════════════════════════╗
║       *ESTOQUE*        
╠════════════════════════╣
║ Seu saldo: *${formatMoney(user.balance)}*
╠════════════════════════╣`;

  // Agrupar por categoria
  const categories = {};
  for (const product of products) {
    const cat = product.category || 'Geral';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(product);
  }

  for (const [category, prods] of Object.entries(categories)) {
    message += `
║ 
║ *${category}*
║ ────────────────────`;
    
    for (const product of prods) {
      const stockCount = db.getProductStock(product.id);
      
      message += `
║ 
║ *${product.id}. ${product.name}*`;
      
      if (product.description1) {
        message += `
║ ${product.description1}`;
      }
      
      message += `
║ Estoque: ${stockCount}
║ Valor: *${formatMoney(product.price)}*
║ /comprar ${product.id}`;
    }
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleSaldo(sock, sender) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  
  const message = `
╔════════════════════════╗
║      *SEU SALDO*       
╠════════════════════════╣
║ 
║ Saldo atual:
║ *${formatMoney(user.balance)}*
║ 
╠════════════════════════╣
║ Para adicionar saldo:
║ /pix <valor>
║ 
║ Exemplo: /pix 10
╚════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handlePix(sock, sender, args) {
  const amount = parseFloat(args[0]?.replace(',', '.'));
  
  if (!amount || isNaN(amount) || amount < 1) {
    await sock.sendMessage(sender, { 
      text: `
╔════════════════════════╗
║    *VALOR INVALIDO*    
╠════════════════════════╣
║ 
║ Use: /pix <valor>
║ 
║ Exemplo: /pix 10
║ 
║ Valor minimo: R$1,00
╚════════════════════════╝
`.trim()
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

    const message = `
╔════════════════════════╗
║    *PAGAMENTO PIX*     
╠════════════════════════╣
║ 
║ Valor: *${formatMoney(amount)}*
║ 
╠════════════════════════╣
║ Expira em 30 minutos
║ 
║ Apos o pagamento, seu
║ saldo sera creditado
║ automaticamente!
╚════════════════════════╝
`.trim();

    await sock.sendMessage(sender, { text: message });

    // Envia o codigo PIX copia e cola SEPARADO para facilitar copiar
    await sock.sendMessage(sender, { text: payment.qr_code });

    // Enviar QR Code como imagem se disponivel
    if (payment.qr_code_base64) {
      const imageBuffer = Buffer.from(payment.qr_code_base64, 'base64');
      await sock.sendMessage(sender, { 
        image: imageBuffer,
        caption: 'Escaneie o QR Code para pagar'
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
      text: `
╔════════════════════════╗
║    *COMO COMPRAR*      
╠════════════════════════╣
║ 
║ Use: /comprar <id> [qtd]
║ 
║ Exemplo: /comprar 1
║ Exemplo: /comprar 1 3
╚════════════════════════╝
`.trim()
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
      text: `Estoque insuficiente!\n\nDisponivel: ${availableStock}` 
    });
    return;
  }

  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const totalPrice = product.price * quantity;

  if (user.balance < totalPrice) {
    await sock.sendMessage(sender, { 
      text: `
╔════════════════════════╗
║  *SALDO INSUFICIENTE*  
╠════════════════════════╣
║ 
║ Seu saldo: ${formatMoney(user.balance)}
║ Preco total: ${formatMoney(totalPrice)}
║ 
║ Faltam: ${formatMoney(totalPrice - user.balance)}
║ 
╠════════════════════════╣
║ Adicione saldo com:
║ /pix ${Math.ceil(totalPrice - user.balance)}
╚════════════════════════╝
`.trim()
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

  let deliveryMessage = `
╔════════════════════════╗
║  *COMPRA REALIZADA!*   
╠════════════════════════╣
║ 
║ Produto: ${product.name}
║ Quantidade: ${quantity}
║ Total: ${formatMoney(totalPrice)}
║ Novo saldo: ${formatMoney(user.balance - totalPrice)}
║ 
║ Data/Hora:
║ ${purchaseTime}
║ 
╠════════════════════════╣
║ *SEUS ITENS:*
╠════════════════════════╣`;

  for (let i = 0; i < itemContents.length; i++) {
    deliveryMessage += `
║ 
║ ${i + 1}. ${itemContents[i]}`;
  }

  deliveryMessage += `
║ 
╠════════════════════════╣
║ Obrigado pela compra!
║ Deixe seu /feedback
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: deliveryMessage.trim() });

  checkLowStock(sock);
}

async function handleMeusPedidos(sock, sender) {
  const purchases = db.getUserPurchases(formatPhone(sender));
  
  if (purchases.length === 0) {
    await sock.sendMessage(sender, { text: 'Voce ainda nao fez nenhuma compra.' });
    return;
  }

  let message = `
╔════════════════════════╗
║    *SUAS COMPRAS*      
╠════════════════════════╣`;

  for (const purchase of purchases.slice(0, 10)) {
    const dateTime = formatDateTime(purchase.purchase_date, purchase.purchase_time);
    message += `
║ 
║ *${purchase.product_name}*
║ Qtd: ${purchase.quantity}
║ Total: ${formatMoney(purchase.total_price)}
║ ${dateTime}`;
  }

  if (purchases.length > 10) {
    message += `
║ 
║ ... e mais ${purchases.length - 10} compra(s)`;
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleSuporte(sock, sender, args) {
  const message = args.join(' ');
  
  if (!message) {
    await sock.sendMessage(sender, { 
      text: `
╔════════════════════════╗
║       *SUPORTE*        
╠════════════════════════╣
║ 
║ Use: /suporte <mensagem>
║ 
║ Exemplo:
║ /suporte Preciso de ajuda
║ com minha compra
╚════════════════════════╝
`.trim()
    });
    return;
  }

  db.createSupportTicket(formatPhone(sender), message);
  
  await sock.sendMessage(sender, { 
    text: `
╔════════════════════════╗
║   *TICKET CRIADO!*     
╠════════════════════════╣
║ 
║ Um administrador
║ respondera em breve.
║ 
║ Aguarde...
╚════════════════════════╝
`.trim()
  });

  await notifyAdmins(sock, `*Novo Ticket de Suporte*\n\nDe: ${sender}\nMensagem: ${message}`);
}

async function handleFeedback(sock, sender, args) {
  const message = args.join(' ');
  
  if (!message) {
    await sock.sendMessage(sender, { 
      text: `
╔════════════════════════╗
║      *FEEDBACK*        
╠════════════════════════╣
║ 
║ Use: /feedback <mensagem>
║ 
║ Exemplo:
║ /feedback Otimo atendimento!
╚════════════════════════╝
`.trim()
    });
    return;
  }

  db.createFeedback(formatPhone(sender), message);
  
  await sock.sendMessage(sender, { 
    text: `
╔════════════════════════╗
║  *FEEDBACK ENVIADO!*   
╠════════════════════════╣
║ 
║ Agradecemos sua opiniao!
╚════════════════════════╝
`.trim()
  });

  await notifyAdmins(sock, `*Novo Feedback*\n\nDe: ${sender}\nMensagem: ${message}`);
}

// ==================== COMANDOS ADMIN ====================

async function handleAdminMenu(sock, sender) {
  const menu = `
╔════════════════════════╗
║     *MENU ADMIN*       
╠════════════════════════╣
║ 
║ *PRODUTOS*
║ ────────────────────
║ /addproduto - Adicionar
║ /editproduto <id> - Editar
║ /delproduto <id> - Remover
║ /addestoque <id> - Estoque
║ /addbanner <id> <url>
║ 
║ *CATEGORIAS*
║ ────────────────────
║ /addcategoria <nome>
║ /listcategorias
║ /delcategoria <id>
║ 
║ *USUARIOS*
║ ────────────────────
║ /usuarios - Listar
║ /addsaldo <num> <valor>
║ /setadmin <num>
║ 
║ *RELATORIOS*
║ ────────────────────
║ /stats - Estatisticas
║ /vendas - Ver vendas
║ /tickets - Ver tickets
║ /feedbacks - Ver feedbacks
║ 
║ *CONFIG*
║ ────────────────────
║ /broadcast <msg>
║ /config - Configuracoes
╚════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: menu });
}

async function handleAddCategoria(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const name = args.join(' ');
  if (!name) {
    await sock.sendMessage(sender, { text: 'Use: /addcategoria <nome>\n\nExemplo: /addcategoria Streaming' });
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

  let message = `
╔════════════════════════╗
║     *CATEGORIAS*       
╠════════════════════════╣`;

  for (const cat of categories) {
    const status = cat.is_active ? 'Ativa' : 'Inativa';
    message += `
║ 
║ ${cat.id}. ${cat.name} (${status})`;
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
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
      text: `
╔════════════════════════╗
║  *ADICIONAR PRODUTO*   
╠════════════════════════╣
║ 
║ Use o formato:
║ /addproduto Nome|Desc1|
║ Desc2|Preco|Categoria
║ 
║ Exemplo:
║ /addproduto Netflix|
║ 30 dias|Entrega auto|
║ 29.90|Streaming
╚════════════════════════╝
`.trim()
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
    text: `
╔════════════════════════╗
║   *PRODUTO CRIADO!*    
╠════════════════════════╣
║ 
║ ID: ${productId}
║ Nome: ${productData.name}
║ Preco: ${formatMoney(productData.price)}
║ Categoria: ${productData.category}
║ 
╠════════════════════════╣
║ Adicione estoque com:
║ /addestoque ${productId}
╚════════════════════════╝
`.trim()
  });
}

async function handleEditProduto(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const productId = parseInt(args[0]);
  if (!productId) {
    await sock.sendMessage(sender, { text: 'Use: /editproduto <id>' });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: 'Produto nao encontrado.' });
    return;
  }

  userStates.set(sender, { action: 'edit_product', productId });
  
  await sock.sendMessage(sender, { 
    text: `
╔════════════════════════╗
║   *EDITAR PRODUTO*     
╠════════════════════════╣
║ 
║ Produto: ${product.name}
║ Preco: ${formatMoney(product.price)}
║ 
║ Envie os novos dados:
║ Nome|Desc|Preco|Categoria
║ 
║ Ou /cancelar
╚════════════════════════╝
`.trim()
  });
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
  await sock.sendMessage(sender, { text: `Produto "${product.name}" removido.` });
}

async function handleAddEstoque(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const productId = parseInt(args[0]);
  if (!productId) {
    await sock.sendMessage(sender, { text: 'Use: /addestoque <id>\n\nDepois envie os itens (um por linha).' });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: 'Produto nao encontrado.' });
    return;
  }

  userStates.set(sender, { action: 'add_stock', productId });
  
  await sock.sendMessage(sender, { 
    text: `
╔════════════════════════╗
║   *ADICIONAR ESTOQUE*  
╠════════════════════════╣
║ 
║ Produto: ${product.name}
║ 
║ Envie os itens do estoque
║ (um por linha):
║ 
║ email1@email.com|senha1
║ email2@email.com|senha2
║ 
║ Ou /cancelar
╚════════════════════════╝
`.trim()
  });
}

async function handleUsuarios(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const users = db.getAllUsers();
  
  if (users.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum usuario cadastrado.' });
    return;
  }

  let message = `
╔════════════════════════╗
║     *USUARIOS*         
╠════════════════════════╣`;

  for (const user of users.slice(0, 20)) {
    const role = user.is_admin ? ' [ADMIN]' : '';
    message += `
║ 
║ ${user.phone}${role}
║ Saldo: ${formatMoney(user.balance)}`;
  }

  if (users.length > 20) {
    message += `
║ 
║ ... e mais ${users.length - 20} usuario(s)`;
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleAddSaldo(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const phone = args[0]?.replace(/\D/g, '');
  const amount = parseFloat(args[1]?.replace(',', '.'));

  if (!phone || !amount || isNaN(amount)) {
    await sock.sendMessage(sender, { text: 'Use: /addsaldo <numero> <valor>\n\nExemplo: /addsaldo 5511999999999 50' });
    return;
  }

  const user = db.updateUserBalance(phone, amount);
  await sock.sendMessage(sender, { text: `Saldo de ${phone} atualizado!\nNovo saldo: ${formatMoney(user.balance)}` });
}

async function handleSetAdmin(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const phone = args[0]?.replace(/\D/g, '');
  if (!phone) {
    await sock.sendMessage(sender, { text: 'Use: /setadmin <numero>' });
    return;
  }

  db.setAdmin(phone, true);
  await sock.sendMessage(sender, { text: `${phone} agora e administrador!` });
}

async function handleStats(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const stats = db.getStats();
  
  const message = `
╔════════════════════════╗
║    *ESTATISTICAS*      
╠════════════════════════╣
║ 
║ Usuarios: ${stats.totalUsers}
║ Produtos: ${stats.totalProducts}
║ Vendas: ${stats.totalSales}
║ 
║ Receita Total:
║ ${formatMoney(stats.totalRevenue)}
║ 
║ Vendas Hoje:
║ ${stats.salesToday} (${formatMoney(stats.revenueToday)})
╚════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handleVendas(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const sales = db.getRecentSales(10);
  
  if (sales.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhuma venda registrada.' });
    return;
  }

  let message = `
╔════════════════════════╗
║   *ULTIMAS VENDAS*     
╠════════════════════════╣`;

  for (const sale of sales) {
    const dateTime = formatDateTime(sale.purchase_date, sale.purchase_time);
    message += `
║ 
║ ${sale.product_name}
║ Cliente: ${sale.phone}
║ Valor: ${formatMoney(sale.total_price)}
║ ${dateTime}`;
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleTickets(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const tickets = db.getOpenTickets();
  
  if (tickets.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum ticket aberto.' });
    return;
  }

  let message = `
╔════════════════════════╗
║   *TICKETS ABERTOS*    
╠════════════════════════╣`;

  for (const ticket of tickets) {
    message += `
║ 
║ #${ticket.id} - ${ticket.phone}
║ ${ticket.message.substring(0, 50)}`;
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleFeedbacks(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const feedbacks = db.getRecentFeedbacks(10);
  
  if (feedbacks.length === 0) {
    await sock.sendMessage(sender, { text: 'Nenhum feedback recebido.' });
    return;
  }

  let message = `
╔════════════════════════╗
║   *FEEDBACKS*          
╠════════════════════════╣`;

  for (const fb of feedbacks) {
    message += `
║ 
║ De: ${fb.phone}
║ ${fb.message.substring(0, 50)}`;
  }

  message += `
║ 
╚════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
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
      const jid = user.phone.includes('@') ? user.phone : user.phone + '@s.whatsapp.net';
      await sock.sendMessage(jid, { text: `*Aviso SabioStore*\n\n${message}` });
      sent++;
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}
  }

  await sock.sendMessage(sender, { text: `Mensagem enviada para ${sent} usuario(s).` });
}

async function handleConfig(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const botName = db.getSetting('bot_name') || 'SabioStore';
  const pixKey = db.getSetting('pix_key') || 'Nao configurado';
  
  const message = `
╔════════════════════════╗
║    *CONFIGURACOES*     
╠════════════════════════╣
║ 
║ Nome: ${botName}
║ PIX: ${pixKey}
║ 
╠════════════════════════╣
║ /setconfig nome <valor>
║ /setconfig pix <chave>
╚════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handleSetConfig(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: 'Sem permissao.' });
    return;
  }

  const key = args[0];
  const value = args.slice(1).join(' ');

  if (!key || !value) {
    await sock.sendMessage(sender, { text: 'Use: /setconfig <chave> <valor>\n\nChaves: nome, pix' });
    return;
  }

  const keyMap = {
    'nome': 'bot_name',
    'pix': 'pix_key',
  };

  const settingKey = keyMap[key.toLowerCase()];
  if (!settingKey) {
    await sock.sendMessage(sender, { text: 'Chave invalida. Use: nome, pix' });
    return;
  }

  db.setSetting(settingKey, value);
  await sock.sendMessage(sender, { text: `Configuracao "${key}" atualizada!` });
}

async function handleCancelar(sock, sender) {
  userStates.delete(sender);
  await sock.sendMessage(sender, { text: 'Operacao cancelada.' });
}

// ==================== LOW STOCK CHECK ====================

async function checkLowStock(sock) {
  const products = db.getProducts(true);
  const lowStockProducts = [];

  for (const product of products) {
    const stock = db.getProductStock(product.id);
    if (stock <= 2) {
      lowStockProducts.push({ ...product, stock });
    }
  }

  if (lowStockProducts.length > 0) {
    let message = `*Alerta de Estoque Baixo*\n`;
    for (const p of lowStockProducts) {
      message += `\n${p.name}: ${p.stock} unidade(s)`;
    }
    await notifyAdmins(sock, message);
  }
}

// ==================== NOTIFY ADMINS ====================

async function notifyAdmins(sock, message) {
  const admins = db.getAdmins();
  for (const admin of admins) {
    try {
      const jid = admin.phone.includes('@') ? admin.phone : admin.phone + '@s.whatsapp.net';
      await sock.sendMessage(jid, { text: message });
    } catch (e) {}
  }
}

// ==================== HANDLE STATE ====================

async function handleStateMessage(sock, sender, message) {
  const state = userStates.get(sender);
  if (!state) return false;

  if (state.action === 'add_stock') {
    const items = message.split('\n').filter(i => i.trim());
    let added = 0;
    
    for (const item of items) {
      if (item.trim()) {
        db.addStockItem(state.productId, item.trim());
        added++;
      }
    }

    userStates.delete(sender);
    await sock.sendMessage(sender, { text: `${added} item(s) adicionado(s) ao estoque!` });
    return true;
  }

  if (state.action === 'edit_product') {
    const data = message.split('|').map(s => s.trim());
    const updates = {};
    
    if (data[0]) updates.name = data[0];
    if (data[1]) updates.description1 = data[1];
    
    const price = data.find(d => !isNaN(parseFloat(d.replace(',', '.'))));
    if (price) updates.price = parseFloat(price.replace(',', '.'));
    
    const lastItem = data[data.length - 1];
    if (lastItem && isNaN(parseFloat(lastItem))) {
      updates.category = lastItem;
    }

    db.updateProduct(state.productId, updates);
    userStates.delete(sender);
    await sock.sendMessage(sender, { text: 'Produto atualizado!' });
    return true;
  }

  return false;
}

// ==================== MAIN HANDLER ====================

async function handleMessage(sock, sender, message) {
  const trimmedMessage = message.trim();
  
  // Check for state
  if (!trimmedMessage.startsWith('/')) {
    const handled = await handleStateMessage(sock, sender, trimmedMessage);
    if (handled) return;
  }

  const [command, ...args] = trimmedMessage.split(' ');
  const cmd = command.toLowerCase();

  // Public commands
  switch (cmd) {
    case '/start':
    case '/menu':
    case '/inicio':
      await handleMenu(sock, sender);
      break;
    case '/estoque':
    case '/produtos':
    case '/loja':
      await handleEstoque(sock, sender, args);
      break;
    case '/categorias':
      await handleCategorias(sock, sender);
      break;
    case '/saldo':
      await handleSaldo(sock, sender);
      break;
    case '/pix':
      await handlePix(sock, sender, args);
      break;
    case '/comprar':
      await handleComprar(sock, sender, args);
      break;
    case '/meuspedidos':
    case '/pedidos':
      await handleMeusPedidos(sock, sender);
      break;
    case '/suporte':
      await handleSuporte(sock, sender, args);
      break;
    case '/feedback':
      await handleFeedback(sock, sender, args);
      break;
    case '/cancelar':
      await handleCancelar(sock, sender);
      break;

    // Admin commands
    case '/admin':
      if (db.isAdmin(formatPhone(sender))) {
        await handleAdminMenu(sock, sender);
      }
      break;
    case '/addproduto':
      await handleAddProduto(sock, sender, args);
      break;
    case '/editproduto':
      await handleEditProduto(sock, sender, args);
      break;
    case '/delproduto':
      await handleDelProduto(sock, sender, args);
      break;
    case '/addestoque':
      await handleAddEstoque(sock, sender, args);
      break;
    case '/addbanner':
      await handleAddBanner(sock, sender, args);
      break;
    case '/addcategoria':
      await handleAddCategoria(sock, sender, args);
      break;
    case '/listcategorias':
      await handleListCategorias(sock, sender);
      break;
    case '/delcategoria':
      await handleDelCategoria(sock, sender, args);
      break;
    case '/usuarios':
      await handleUsuarios(sock, sender);
      break;
    case '/addsaldo':
      await handleAddSaldo(sock, sender, args);
      break;
    case '/setadmin':
      await handleSetAdmin(sock, sender, args);
      break;
    case '/stats':
      await handleStats(sock, sender);
      break;
    case '/vendas':
      await handleVendas(sock, sender);
      break;
    case '/tickets':
      await handleTickets(sock, sender);
      break;
    case '/feedbacks':
      await handleFeedbacks(sock, sender);
      break;
    case '/broadcast':
      await handleBroadcast(sock, sender, args);
      break;
    case '/config':
      await handleConfig(sock, sender);
      break;
    case '/setconfig':
      await handleSetConfig(sock, sender, args);
      break;
    default:
      // Unknown command - do nothing
      break;
  }
}

module.exports = {
  handleMessage,
  notifyAdmins,
};
