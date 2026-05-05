const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../database/operations');
const { initDatabase } = require('../database/schema');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sabiostore-secret-key-change-this';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

initDatabase();

const defaultAdmin = db.getPanelAdmin('admin');
if (!defaultAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.createPanelAdmin('admin', hashedPassword);
  console.log('Admin padrao criado: admin / admin123');
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalido' });
  }
}

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const admin = db.getPanelAdmin(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Credenciais invalidas' });
  }
  
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: admin.username });
});

// Dashboard
app.get('/api/stats', authMiddleware, (req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

// Categories
app.get('/api/categories', authMiddleware, (req, res) => {
  const categories = db.getCategories(false);
  res.json(categories);
});

app.post('/api/categories', authMiddleware, (req, res) => {
  try {
    const { name, description, banner_url } = req.body;
    const id = db.createCategory(name, description, banner_url);
    res.json({ id, message: 'Categoria criada com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/categories/:id', authMiddleware, (req, res) => {
  try {
    db.updateCategory(req.params.id, req.body);
    res.json({ message: 'Categoria atualizada com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  try {
    db.deleteCategory(req.params.id);
    res.json({ message: 'Categoria removida com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Products
app.get('/api/products', authMiddleware, (req, res) => {
  const products = db.getProducts(false);
  const productsWithStock = products.map(p => ({
    ...p,
    available_stock: db.getProductStock(p.id)
  }));
  res.json(productsWithStock);
});

app.post('/api/products', authMiddleware, (req, res) => {
  try {
    const id = db.createProduct(req.body);
    res.json({ id, message: 'Produto criado com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/products/:id', authMiddleware, (req, res) => {
  try {
    db.updateProduct(req.params.id, req.body);
    res.json({ message: 'Produto atualizado com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  try {
    db.deleteProduct(req.params.id);
    res.json({ message: 'Produto removido com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Stock
app.post('/api/products/:id/stock', authMiddleware, (req, res) => {
  const { items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Itens invalidos' });
  }
  
  try {
    db.addStockItems(req.params.id, items);
    res.json({ message: `${items.length} itens adicionados ao estoque` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Users
app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.getAllUsers();
  res.json(users);
});

app.put('/api/users/:phone/balance', authMiddleware, (req, res) => {
  const { amount } = req.body;
  
  try {
    db.createUser(req.params.phone);
    const user = db.updateUserBalance(req.params.phone, amount);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:phone/admin', authMiddleware, (req, res) => {
  const { isAdmin } = req.body;
  
  try {
    db.setAdmin(req.params.phone, isAdmin);
    res.json({ message: 'Admin atualizado' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Purchases
app.get('/api/purchases', authMiddleware, (req, res) => {
  const purchases = db.getAllPurchases();
  res.json(purchases);
});

// Payments
app.get('/api/payments', authMiddleware, (req, res) => {
  const payments = db.getAllPayments();
  res.json(payments);
});

// Tickets
app.get('/api/tickets', authMiddleware, (req, res) => {
  const tickets = db.getAllSupportTickets();
  res.json(tickets);
});

app.put('/api/tickets/:id/respond', authMiddleware, (req, res) => {
  const { response } = req.body;
  
  try {
    db.respondSupportTicket(req.params.id, response);
    res.json({ message: 'Ticket respondido' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Feedbacks
app.get('/api/feedbacks', authMiddleware, (req, res) => {
  const feedbacks = db.getAllFeedbacks();
  res.json(feedbacks);
});

app.put('/api/feedbacks/:id/respond', authMiddleware, (req, res) => {
  const { response } = req.body;
  
  try {
    db.respondFeedback(req.params.id, response);
    res.json({ message: 'Feedback respondido' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Settings
app.get('/api/settings', authMiddleware, (req, res) => {
  const settings = db.getAllSettings();
  res.json(settings);
});

app.put('/api/settings', authMiddleware, (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      db.setSetting(key, value);
    }
    res.json({ message: 'Configuracoes atualizadas' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Low Stock
app.get('/api/low-stock', authMiddleware, (req, res) => {
  const products = db.getLowStockProducts();
  res.json(products);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Painel admin rodando em http://localhost:${PORT}`);
  console.log(`Acesse de outros dispositivos: http://SEU_IP:${PORT}`);
});
