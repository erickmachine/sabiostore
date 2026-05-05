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
╔══════════════════════════════╗
║     🛒 *${botName}* 🛒     
╠══════════════════════════════╣
║                              
║  👋 Olá! Seja bem-vindo(a)!  
║                              
║  💰 Seu saldo: *${formatMoney(user.balance)}*
║                              
╠══════════════════════════════╣
║  📋 *COMANDOS DISPONÍVEIS*   
╠══════════════════════════════╣
║                              
║  📦 /estoque                 
║     _Ver produtos disponíveis_
║                              
║  🏷️ /categorias              
║     _Ver categorias_         
║                              
║  💳 /saldo                   
║     _Consultar seu saldo_    
║                              
║  💵 /pix <valor>             
║     _Adicionar saldo via PIX_
║                              
║  🛍️ /comprar <id>            
║     _Comprar um produto_     
║                              
║  📜 /meuspedidos             
║     _Ver suas compras_       
║                              
║  🎧 /suporte <msg>           
║     _Abrir ticket de suporte_
║                              
║  ⭐ /feedback <msg>          
║     _Enviar sua opinião_     
║                              
╚══════════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: menu });
}

async function handleCategorias(sock, sender) {
  const categories = db.getCategories(true);
  
  if (categories.length === 0) {
    await sock.sendMessage(sender, { text: '❌ Nenhuma categoria disponível.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║   🏷️ *CATEGORIAS* 🏷️       
╠══════════════════════════════╣`;

  for (const cat of categories) {
    const products = db.getProductsByCategory(cat.id);
    message += `
║                              
║  📁 *${cat.name}*`;
    if (cat.description) {
      message += `
║     ${cat.description}`;
    }
    message += `
║     📦 ${products.length} produto(s)`;
  }

  message += `
║                              
╠══════════════════════════════╣
║  Digite /estoque para ver    
║  todos os produtos           
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleEstoque(sock, sender, args) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const products = db.getProducts(true);
  
  if (products.length === 0) {
    await sock.sendMessage(sender, { text: '❌ Nenhum produto disponível no momento.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║     📦 *ESTOQUE* 📦         
╠══════════════════════════════╣
║  💰 Seu saldo: *${formatMoney(user.balance)}*
╠══════════════════════════════╣`;

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
║  🏷️ *${category}*           
║  ─────────────────────────`;
    
    for (const product of prods) {
      const stockCount = db.getProductStock(product.id);
      
      message += `
║                              
║  🔹 *${product.id}. ${product.name}*`;
      
      if (product.description1) {
        message += `
║     📝 ${product.description1}`;
      }
      if (product.description2) {
        message += `
║     📝 ${product.description2}`;
      }
      
      message += `
║     📊 Estoque: ${stockCount}
║     💵 Valor: *${formatMoney(product.price)}*
║     🛒 /comprar ${product.id}`;
    }
  }

  message += `
║                              
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleSaldo(sock, sender) {
  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  
  const message = `
╔══════════════════════════════╗
║     💳 *SEU SALDO* 💳       
╠══════════════════════════════╣
║                              
║  💰 Saldo atual:             
║                              
║     *${formatMoney(user.balance)}*
║                              
╠══════════════════════════════╣
║  💵 Para adicionar saldo:    
║                              
║     /pix <valor>             
║                              
║  📌 Exemplo: /pix 10         
╚══════════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handlePix(sock, sender, args) {
  const amount = parseFloat(args[0]?.replace(',', '.'));
  
  if (!amount || isNaN(amount) || amount < 1) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║     ⚠️ *VALOR INVÁLIDO* ⚠️   
╠══════════════════════════════╣
║                              
║  Use: /pix <valor>           
║                              
║  📌 Exemplo: /pix 10         
║                              
║  💵 Valor mínimo: R$1,00     
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  if (amount > 1000) {
    await sock.sendMessage(sender, { 
      text: '⚠️ Valor máximo por transação: R$1.000,00' 
    });
    return;
  }

  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const pixKey = db.getSetting('pix_key') || 'patinhasqueprecisam@gmail.com';

  try {
    await sock.sendMessage(sender, { text: '⏳ Gerando pagamento PIX...' });
    
    const payment = await createPixPayment(amount, `SabioStore - Saldo para ${formatPhone(sender)}`);
    
    db.createPayment(
      formatPhone(sender),
      amount,
      payment.id.toString(),
      payment.qr_code,
      payment.qr_code_base64
    );

    const message = `
╔══════════════════════════════╗
║     💵 *PAGAMENTO PIX* 💵   
╠══════════════════════════════╣
║                              
║  💰 Valor: *${formatMoney(amount)}*
║                              
╠══════════════════════════════╣
║  📧 *CHAVE PIX (Email):*     
╠══════════════════════════════╣
║                              
║  ${pixKey}
║                              
╠══════════════════════════════╣
║  📋 *CÓDIGO COPIA E COLA:*   
╠══════════════════════════════╣

\`\`\`
${payment.qr_code}
\`\`\`

╔══════════════════════════════╗
║  ⏰ Expira em 30 minutos     
║                              
║  ✅ Após o pagamento, seu    
║  saldo será creditado        
║  automaticamente!            
╚══════════════════════════════╝
`.trim();

    await sock.sendMessage(sender, { text: message });

    // Enviar QR Code como imagem
    if (payment.qr_code_base64) {
      const imageBuffer = Buffer.from(payment.qr_code_base64, 'base64');
      await sock.sendMessage(sender, { 
        image: imageBuffer,
        caption: '📱 QR Code PIX - Escaneie para pagar'
      });
    }

  } catch (error) {
    console.error('Error creating PIX:', error);
    await sock.sendMessage(sender, { 
      text: '❌ Erro ao gerar pagamento. Tente novamente mais tarde.' 
    });
  }
}

async function handleComprar(sock, sender, args) {
  const productId = parseInt(args[0]);
  const quantity = parseInt(args[1]) || 1;
  
  if (!productId) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║     ℹ️ *COMO COMPRAR* ℹ️     
╠══════════════════════════════╣
║                              
║  Use: /comprar <id> [qtd]    
║                              
║  📌 Exemplo: /comprar 1      
║  📌 Exemplo: /comprar 1 3    
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  const product = db.getProduct(productId);
  if (!product || !product.is_active) {
    await sock.sendMessage(sender, { text: '❌ Produto não encontrado.' });
    return;
  }

  const availableStock = db.getProductStock(productId);
  if (availableStock < quantity) {
    await sock.sendMessage(sender, { 
      text: `❌ Estoque insuficiente!\n\n📦 Disponível: ${availableStock}` 
    });
    return;
  }

  const user = db.getUser(formatPhone(sender)) || db.createUser(formatPhone(sender));
  const totalPrice = product.price * quantity;

  if (user.balance < totalPrice) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║   ❌ *SALDO INSUFICIENTE*   
╠══════════════════════════════╣
║                              
║  💰 Seu saldo: ${formatMoney(user.balance)}
║  💵 Preço total: ${formatMoney(totalPrice)}
║                              
║  📌 Faltam: ${formatMoney(totalPrice - user.balance)}
║                              
╠══════════════════════════════╣
║  Adicione saldo com:         
║  /pix ${Math.ceil(totalPrice - user.balance)}
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  const stockItems = db.getAvailableStockItems(productId, quantity);
  if (stockItems.length < quantity) {
    await sock.sendMessage(sender, { text: '❌ Erro ao processar compra. Tente novamente.' });
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
╔══════════════════════════════╗
║   ✅ *COMPRA REALIZADA!* ✅  
╠══════════════════════════════╣
║                              
║  📦 Produto: ${product.name}
║  📊 Quantidade: ${quantity}
║  💵 Total: ${formatMoney(totalPrice)}
║  💰 Novo saldo: ${formatMoney(user.balance - totalPrice)}
║                              
║  🕐 Data/Hora:               
║  ${purchaseTime}
║                              
╠══════════════════════════════╣
║  🔐 *SEUS ITENS:*            
╠══════════════════════════════╣`;

  for (let i = 0; i < itemContents.length; i++) {
    deliveryMessage += `
║                              
║  ${i + 1}. \`${itemContents[i]}\``;
  }

  deliveryMessage += `
║                              
╠══════════════════════════════╣
║  🙏 Obrigado pela compra!    
║  ⭐ Deixe seu /feedback      
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: deliveryMessage.trim() });

  checkLowStock(sock);
}

async function handleMeusPedidos(sock, sender) {
  const purchases = db.getUserPurchases(formatPhone(sender));
  
  if (purchases.length === 0) {
    await sock.sendMessage(sender, { text: '📭 Você ainda não fez nenhuma compra.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║     📜 *SUAS COMPRAS* 📜     
╠══════════════════════════════╣`;

  for (const purchase of purchases.slice(0, 10)) {
    const dateTime = formatDateTime(purchase.purchase_date, purchase.purchase_time);
    message += `
║                              
║  🔹 *${purchase.product_name}*
║     📊 Qtd: ${purchase.quantity}
║     💵 Total: ${formatMoney(purchase.total_price)}
║     🕐 ${dateTime}`;
  }

  if (purchases.length > 10) {
    message += `
║                              
║  ... e mais ${purchases.length - 10} compra(s)`;
  }

  message += `
║                              
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleSuporte(sock, sender, args) {
  const message = args.join(' ');
  
  if (!message) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║     🎧 *SUPORTE* 🎧          
╠══════════════════════════════╣
║                              
║  Use: /suporte <mensagem>    
║                              
║  📌 Exemplo:                 
║  /suporte Preciso de ajuda   
║  com minha compra            
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  db.createSupportTicket(formatPhone(sender), message);
  
  await sock.sendMessage(sender, { 
    text: `
╔══════════════════════════════╗
║  ✅ *TICKET CRIADO!*         
╠══════════════════════════════╣
║                              
║  🎧 Um administrador         
║  responderá em breve.        
║                              
║  ⏰ Aguarde...               
╚══════════════════════════════╝
`.trim()
  });

  await notifyAdmins(sock, `🎧 *Novo Ticket de Suporte*\n\n📱 De: ${sender}\n💬 Mensagem: ${message}`);
}

async function handleFeedback(sock, sender, args) {
  const message = args.join(' ');
  
  if (!message) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║     ⭐ *FEEDBACK* ⭐          
╠══════════════════════════════╣
║                              
║  Use: /feedback <mensagem>   
║                              
║  📌 Exemplo:                 
║  /feedback Ótimo atendimento!
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  db.createFeedback(formatPhone(sender), message);
  
  await sock.sendMessage(sender, { 
    text: `
╔══════════════════════════════╗
║  ✅ *FEEDBACK ENVIADO!*      
╠══════════════════════════════╣
║                              
║  🙏 Agradecemos sua opinião! 
╚══════════════════════════════╝
`.trim()
  });

  await notifyAdmins(sock, `⭐ *Novo Feedback*\n\n📱 De: ${sender}\n💬 Mensagem: ${message}`);
}

// ==================== COMANDOS ADMIN ====================

async function handleAdminMenu(sock, sender) {
  const menu = `
╔══════════════════════════════╗
║     ⚙️ *MENU ADMIN* ⚙️       
╠══════════════════════════════╣
║                              
║  📦 *PRODUTOS*               
║  ─────────────────────────   
║  /addproduto - Adicionar     
║  /editproduto <id> - Editar  
║  /delproduto <id> - Remover  
║  /addestoque <id> - Estoque  
║  /addbanner <id> <url>       
║                              
║  🏷️ *CATEGORIAS*             
║  ─────────────────────────   
║  /addcategoria <nome>        
║  /listcategorias             
║  /delcategoria <id>          
║                              
║  👥 *USUÁRIOS*               
║  ─────────────────────────   
║  /usuarios - Listar          
║  /addsaldo <num> <valor>     
║  /setadmin <num>             
║                              
║  📊 *RELATÓRIOS*             
║  ─────────────────────────   
║  /stats - Estatísticas       
║  /vendas - Ver vendas        
║  /tickets - Ver tickets      
║  /feedbacks - Ver feedbacks  
║                              
║  ⚙️ *CONFIG*                 
║  ─────────────────────────   
║  /broadcast <msg>            
║  /config - Configurações     
╚══════════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: menu });
}

async function handleAddCategoria(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const name = args.join(' ');
  if (!name) {
    await sock.sendMessage(sender, { text: '📌 Use: /addcategoria <nome>\n\nExemplo: /addcategoria Streaming' });
    return;
  }

  const id = db.createCategory(name);
  await sock.sendMessage(sender, { text: `✅ Categoria "${name}" criada com ID: ${id}` });
}

async function handleListCategorias(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const categories = db.getCategories(false);
  
  if (categories.length === 0) {
    await sock.sendMessage(sender, { text: '📭 Nenhuma categoria cadastrada.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║     🏷️ *CATEGORIAS* 🏷️       
╠══════════════════════════════╣`;

  for (const cat of categories) {
    const status = cat.is_active ? '✅' : '❌';
    const banner = cat.banner_url ? '🖼️' : '';
    message += `
║                              
║  ${status} ${cat.id}. ${cat.name} ${banner}`;
  }

  message += `
║                              
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleDelCategoria(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const id = parseInt(args[0]);
  if (!id) {
    await sock.sendMessage(sender, { text: '📌 Use: /delcategoria <id>' });
    return;
  }

  db.deleteCategory(id);
  await sock.sendMessage(sender, { text: `✅ Categoria ${id} removida.` });
}

async function handleAddBanner(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const productId = parseInt(args[0]);
  const bannerUrl = args[1];

  if (!productId || !bannerUrl) {
    await sock.sendMessage(sender, { text: '📌 Use: /addbanner <id_produto> <url_imagem>' });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: '❌ Produto não encontrado.' });
    return;
  }

  db.updateProduct(productId, { banner_url: bannerUrl });
  await sock.sendMessage(sender, { text: `✅ Banner adicionado ao produto "${product.name}"!` });
}

async function handleAddProduto(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  // Formato: /addproduto Nome|Desc1|Desc2|Preco|Categoria
  const data = args.join(' ').split('|').map(s => s.trim());
  
  if (data.length < 2) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║  📦 *ADICIONAR PRODUTO*      
╠══════════════════════════════╣
║                              
║  Use o formato:              
║  /addproduto Nome|Desc1|     
║  Desc2|Preço|Categoria       
║                              
║  📌 Exemplo:                 
║  /addproduto Netflix Premium|
║  30 dias|Entrega automática| 
║  29.90|Streaming             
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  const price = parseFloat(data.find(d => !isNaN(parseFloat(d.replace(',', '.'))))?.replace(',', '.') || '0');
  
  if (price <= 0) {
    await sock.sendMessage(sender, { text: '❌ Preço inválido.' });
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
╔══════════════════════════════╗
║  ✅ *PRODUTO CRIADO!*        
╠══════════════════════════════╣
║                              
║  🆔 ID: ${productId}
║  📦 Nome: ${productData.name}
║  💵 Preço: ${formatMoney(productData.price)}
║  🏷️ Categoria: ${productData.category}
║                              
╠══════════════════════════════╣
║  Adicione estoque com:       
║  /addestoque ${productId} <conteúdo>
╚══════════════════════════════╝
`.trim()
  });
}

async function handleAddEstoque(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const productId = parseInt(args[0]);
  const content = args.slice(1).join(' ');
  
  if (!productId || !content) {
    await sock.sendMessage(sender, { 
      text: `
╔══════════════════════════════╗
║  📦 *ADICIONAR ESTOQUE*      
╠══════════════════════════════╣
║                              
║  Use: /addestoque <id> <item>
║                              
║  Para múltiplos itens:       
║  Separe por linha            
║                              
║  📌 Exemplo:                 
║  /addestoque 1               
║  conta1@email.com            
║  conta2@email.com            
╚══════════════════════════════╝
`.trim()
    });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: '❌ Produto não encontrado.' });
    return;
  }

  const items = content.split('\n').filter(i => i.trim());
  
  if (items.length > 1) {
    db.addStockItems(productId, items);
    await sock.sendMessage(sender, { 
      text: `✅ ${items.length} itens adicionados ao estoque de "${product.name}"!` 
    });
  } else {
    db.addStockItem(productId, content);
    await sock.sendMessage(sender, { 
      text: `✅ Item adicionado ao estoque de "${product.name}"!` 
    });
  }
}

async function handleDelProduto(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const productId = parseInt(args[0]);
  if (!productId) {
    await sock.sendMessage(sender, { text: '📌 Use: /delproduto <id>' });
    return;
  }

  const product = db.getProduct(productId);
  if (!product) {
    await sock.sendMessage(sender, { text: '❌ Produto não encontrado.' });
    return;
  }

  db.deleteProduct(productId);
  await sock.sendMessage(sender, { text: `✅ Produto "${product.name}" removido!` });
}

async function handleStats(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const stats = db.getStats();
  
  const message = `
╔══════════════════════════════╗
║     📊 *ESTATÍSTICAS* 📊     
╠══════════════════════════════╣
║                              
║  👥 Usuários: ${stats.totalUsers}
║  📦 Produtos ativos: ${stats.totalProducts}
║  🏷️ Categorias: ${stats.totalCategories}
║  🛒 Total de vendas: ${stats.totalPurchases}
║  💰 Receita total: ${formatMoney(stats.totalRevenue)}
║                              
╠══════════════════════════════╣
║     📅 *HOJE*                
╠══════════════════════════════╣
║                              
║  🛒 Vendas: ${stats.todaySales}
║  💰 Receita: ${formatMoney(stats.todayRevenue)}
║                              
╠══════════════════════════════╣
║  ⏳ Pgtos pendentes: ${stats.pendingPayments}
║  🎧 Tickets abertos: ${stats.openTickets}
║  ⭐ Feedbacks: ${stats.pendingFeedbacks}
╚══════════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: message });
}

async function handleAddSaldo(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const phone = formatPhone(args[0] || '');
  const amount = parseFloat(args[1]?.replace(',', '.'));

  if (!phone || !amount || isNaN(amount)) {
    await sock.sendMessage(sender, { 
      text: '📌 Use: /addsaldo <número> <valor>\n\nExemplo: /addsaldo 5511999999999 50' 
    });
    return;
  }

  db.createUser(phone);
  const user = db.updateUserBalance(phone, amount);
  
  await sock.sendMessage(sender, { 
    text: `
╔══════════════════════════════╗
║  ✅ *SALDO ADICIONADO*       
╠══════════════════════════════╣
║                              
║  📱 Número: ${phone}
║  💵 Valor: ${formatMoney(amount)}
║  💰 Novo saldo: ${formatMoney(user.balance)}
╚══════════════════════════════╝
`.trim()
  });
}

async function handleUsuarios(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const users = db.getAllUsers();
  
  let message = `
╔══════════════════════════════╗
║  👥 *USUÁRIOS (${users.length})*
╠══════════════════════════════╣`;

  for (const user of users.slice(0, 20)) {
    const admin = user.is_admin ? ' ⚙️' : '';
    message += `
║                              
║  📱 ${user.phone}${admin}
║     💰 Saldo: ${formatMoney(user.balance)}`;
  }

  if (users.length > 20) {
    message += `
║                              
║  ... e mais ${users.length - 20} usuários`;
  }

  message += `
║                              
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleTickets(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const tickets = db.getOpenSupportTickets();
  
  if (tickets.length === 0) {
    await sock.sendMessage(sender, { text: '✅ Nenhum ticket aberto.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║  🎧 *TICKETS ABERTOS (${tickets.length})*
╠══════════════════════════════╣`;

  for (const ticket of tickets) {
    const date = new Date(ticket.created_at).toLocaleString('pt-BR');
    message += `
║                              
║  🆔 ID: ${ticket.id}
║  📱 ${ticket.phone}
║  💬 ${ticket.message}
║  🕐 ${date}`;
  }

  message += `
║                              
╠══════════════════════════════╣
║  Responda com:               
║  /respticket <id> <mensagem> 
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleRespTicket(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const ticketId = parseInt(args[0]);
  const response = args.slice(1).join(' ');

  if (!ticketId || !response) {
    await sock.sendMessage(sender, { text: '📌 Use: /respticket <id> <resposta>' });
    return;
  }

  db.respondSupportTicket(ticketId, response);
  await sock.sendMessage(sender, { text: `✅ Ticket #${ticketId} respondido!` });
}

async function handleFeedbacks(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const feedbacks = db.getAllFeedbacks();
  
  if (feedbacks.length === 0) {
    await sock.sendMessage(sender, { text: '📭 Nenhum feedback recebido.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║  ⭐ *FEEDBACKS (${feedbacks.length})*
╠══════════════════════════════╣`;

  for (const fb of feedbacks.slice(0, 10)) {
    const date = new Date(fb.created_at).toLocaleString('pt-BR');
    const status = fb.status === 'pending' ? '⏳' : '✅';
    message += `
║                              
║  ${status} ID: ${fb.id}
║  📱 ${fb.phone}
║  💬 ${fb.message}
║  🕐 ${date}`;
  }

  if (feedbacks.length > 10) {
    message += `
║                              
║  ... e mais ${feedbacks.length - 10} feedback(s)`;
  }

  message += `
║                              
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleVendas(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const sales = db.getRecentSales(20);
  
  if (sales.length === 0) {
    await sock.sendMessage(sender, { text: '📭 Nenhuma venda registrada.' });
    return;
  }

  let message = `
╔══════════════════════════════╗
║  🛒 *VENDAS RECENTES*        
╠══════════════════════════════╣`;

  for (const sale of sales) {
    const dateTime = formatDateTime(sale.purchase_date, sale.purchase_time);
    message += `
║                              
║  📦 ${sale.product_name}
║  📱 ${sale.phone}
║  📊 Qtd: ${sale.quantity} | 💵 ${formatMoney(sale.total_price)}
║  🕐 ${dateTime}`;
  }

  message += `
║                              
╚══════════════════════════════╝`;

  await sock.sendMessage(sender, { text: message.trim() });
}

async function handleSetAdmin(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const phone = formatPhone(args[0] || '');
  if (!phone) {
    await sock.sendMessage(sender, { text: '📌 Use: /setadmin <número>\n\nExemplo: /setadmin 5511999999999' });
    return;
  }

  db.createUser(phone);
  db.setAdmin(phone, true);
  
  await sock.sendMessage(sender, { text: `✅ Usuário ${phone} agora é administrador!` });
}

async function handleBroadcast(sock, sender, args) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const message = args.join(' ');
  if (!message) {
    await sock.sendMessage(sender, { text: '📌 Use: /broadcast <mensagem>' });
    return;
  }

  const users = db.getAllUsers();
  let sent = 0;

  for (const user of users) {
    try {
      const jid = user.phone.includes('@') ? user.phone : user.phone + '@s.whatsapp.net';
      await sock.sendMessage(jid, { text: `📢 *AVISO*\n\n${message}` });
      sent++;
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}
  }

  await sock.sendMessage(sender, { text: `✅ Mensagem enviada para ${sent} usuários!` });
}

async function handleConfig(sock, sender) {
  if (!db.isAdmin(formatPhone(sender))) {
    await sock.sendMessage(sender, { text: '❌ Sem permissão.' });
    return;
  }

  const botName = db.getSetting('bot_name') || 'SabioStore';
  const pixKey = db.getSetting('pix_key') || 'Não configurado';
  const welcomeMsg = db.getSetting('welcome_message') || 'Padrão';

  const message = `
╔══════════════════════════════╗
║     ⚙️ *CONFIGURAÇÕES* ⚙️    
╠══════════════════════════════╣
║                              
║  🤖 Nome do Bot:             
║     ${botName}
║                              
║  💳 Chave PIX:               
║     ${pixKey}
║                              
║  👋 Mensagem de boas-vindas: 
║     ${welcomeMsg}
║                              
╠══════════════════════════════╣
║  Para alterar, acesse o      
║  painel web administrativo   
╚══════════════════════════════╝
`.trim();

  await sock.sendMessage(sender, { text: message });
}

// ==================== UTILIDADES ====================

async function checkLowStock(sock) {
  const products = db.getProducts(true);
  
  for (const product of products) {
    const stock = db.getProductStock(product.id);
    if (stock > 0 && stock <= 3) {
      await notifyAdmins(sock, `⚠️ *Estoque Baixo*\n\n📦 ${product.name}\n📊 Apenas ${stock} unidade(s) restante(s)!`);
    }
  }
}

async function notifyAdmins(sock, message) {
  try {
    const admins = db.getAdmins();
    
    for (const admin of admins) {
      try {
        const jid = admin.phone.includes('@') ? admin.phone : admin.phone + '@s.whatsapp.net';
        await sock.sendMessage(jid, { text: message });
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {}
    }
  } catch (error) {
    console.error('Error notifying admins:', error);
  }
}

// ==================== HANDLER PRINCIPAL ====================

async function handleMessage(sock, sender, text) {
  const args = text.trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const phone = formatPhone(sender);

  // Criar usuario se nao existir
  db.createUser(phone);

  const commands = {
    // Publicos
    '/start': () => handleMenu(sock, sender),
    '/menu': () => handleMenu(sock, sender),
    '/help': () => handleMenu(sock, sender),
    '/estoque': () => handleEstoque(sock, sender, args),
    '/loja': () => handleEstoque(sock, sender, args),
    '/categorias': () => handleCategorias(sock, sender),
    '/saldo': () => handleSaldo(sock, sender),
    '/pix': () => handlePix(sock, sender, args),
    '/comprar': () => handleComprar(sock, sender, args),
    '/buy': () => handleComprar(sock, sender, args),
    '/meuspedidos': () => handleMeusPedidos(sock, sender),
    '/pedidos': () => handleMeusPedidos(sock, sender),
    '/suporte': () => handleSuporte(sock, sender, args),
    '/feedback': () => handleFeedback(sock, sender, args),
    
    // Admin
    '/admin': () => handleAdminMenu(sock, sender),
    '/addproduto': () => handleAddProduto(sock, sender, args),
    '/addestoque': () => handleAddEstoque(sock, sender, args),
    '/delproduto': () => handleDelProduto(sock, sender, args),
    '/addbanner': () => handleAddBanner(sock, sender, args),
    '/addcategoria': () => handleAddCategoria(sock, sender, args),
    '/listcategorias': () => handleListCategorias(sock, sender),
    '/delcategoria': () => handleDelCategoria(sock, sender, args),
    '/usuarios': () => handleUsuarios(sock, sender),
    '/addsaldo': () => handleAddSaldo(sock, sender, args),
    '/setadmin': () => handleSetAdmin(sock, sender, args),
    '/stats': () => handleStats(sock, sender),
    '/vendas': () => handleVendas(sock, sender),
    '/tickets': () => handleTickets(sock, sender),
    '/respticket': () => handleRespTicket(sock, sender, args),
    '/feedbacks': () => handleFeedbacks(sock, sender),
    '/broadcast': () => handleBroadcast(sock, sender, args),
    '/config': () => handleConfig(sock, sender),
  };

  const handler = commands[command];
  if (handler) {
    await handler();
  }
}

module.exports = {
  handleMessage,
  notifyAdmins,
};
