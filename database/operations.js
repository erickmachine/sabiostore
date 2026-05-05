const { getDb } = require('./schema');

// ==================== USERS ====================

function getUser(phone) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  db.close();
  return user;
}

function createUser(phone, name = null) {
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO users (phone, name) VALUES (?, ?)');
  stmt.run(phone, name);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  db.close();
  return user;
}

function updateUserBalance(phone, amount) {
  const db = getDb();
  db.prepare('UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE phone = ?').run(amount, phone);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  db.close();
  return user;
}

function setUserBalance(phone, amount) {
  const db = getDb();
  db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE phone = ?').run(amount, phone);
  db.close();
}

function isAdmin(phone) {
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE phone = ?').get(phone);
  db.close();
  return user?.is_admin === 1;
}

function getAllUsers() {
  const db = getDb();
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  db.close();
  return users;
}

function setAdmin(phone, isAdmin) {
  const db = getDb();
  db.prepare('UPDATE users SET is_admin = ? WHERE phone = ?').run(isAdmin ? 1 : 0, phone);
  db.close();
}

// ==================== CATEGORIES ====================

function getCategories(activeOnly = true) {
  const db = getDb();
  let query = 'SELECT * FROM categories';
  if (activeOnly) query += ' WHERE is_active = 1';
  query += ' ORDER BY sort_order, name';
  const categories = db.prepare(query).all();
  db.close();
  return categories;
}

function getCategory(id) {
  const db = getDb();
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  db.close();
  return category;
}

function createCategory(name, description = null, bannerUrl = null) {
  const db = getDb();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM categories').get();
  const sortOrder = (maxOrder?.max || 0) + 1;
  const stmt = db.prepare('INSERT INTO categories (name, description, banner_url, sort_order) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, description, bannerUrl, sortOrder);
  db.close();
  return result.lastInsertRowid;
}

function updateCategory(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  db.close();
}

function deleteCategory(id) {
  const db = getDb();
  db.prepare('UPDATE products SET category_id = NULL, category = "Geral" WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  db.close();
}

// ==================== PRODUCTS ====================

function getProducts(activeOnly = true) {
  const db = getDb();
  let query = 'SELECT p.*, c.name as category_name, c.banner_url as category_banner FROM products p LEFT JOIN categories c ON p.category_id = c.id';
  if (activeOnly) query += ' WHERE p.is_active = 1';
  query += ' ORDER BY p.category, p.id';
  const products = db.prepare(query).all();
  db.close();
  return products;
}

function getProductsByCategory(categoryId) {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products WHERE category_id = ? AND is_active = 1 ORDER BY id').all(categoryId);
  db.close();
  return products;
}

function getProduct(id) {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  db.close();
  return product;
}

function createProduct(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO products (name, description1, description2, description3, description4, price, quantity, banner_url, category_id, category, low_stock_alert)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.description1 || null,
    data.description2 || null,
    data.description3 || null,
    data.description4 || null,
    data.price,
    data.quantity || 0,
    data.banner_url || null,
    data.category_id || null,
    data.category || 'Geral',
    data.low_stock_alert || 5
  );
  db.close();
  return result.lastInsertRowid;
}

function updateProduct(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  db.close();
}

function deleteProduct(id) {
  const db = getDb();
  db.prepare('DELETE FROM stock_items WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  db.close();
}

function getProductStock(productId) {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as count FROM stock_items WHERE product_id = ? AND is_sold = 0').get(productId);
  db.close();
  return count?.count || 0;
}

function getLowStockProducts() {
  const db = getDb();
  const products = db.prepare(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM stock_items WHERE product_id = p.id AND is_sold = 0) as available_stock
    FROM products p
    WHERE p.is_active = 1
    HAVING available_stock <= p.low_stock_alert
  `).all();
  db.close();
  return products;
}

// ==================== STOCK ITEMS ====================

function addStockItem(productId, content) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO stock_items (product_id, content) VALUES (?, ?)');
  const result = stmt.run(productId, content);
  db.prepare('UPDATE products SET quantity = quantity + 1 WHERE id = ?').run(productId);
  db.close();
  return result.lastInsertRowid;
}

function addStockItems(productId, contents) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO stock_items (product_id, content) VALUES (?, ?)');
  const insertMany = db.transaction((items) => {
    for (const content of items) {
      stmt.run(productId, content);
    }
  });
  insertMany(contents);
  db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(contents.length, productId);
  db.close();
}

function getAvailableStockItems(productId, quantity) {
  const db = getDb();
  const items = db.prepare(`
    SELECT * FROM stock_items 
    WHERE product_id = ? AND is_sold = 0 
    LIMIT ?
  `).all(productId, quantity);
  db.close();
  return items;
}

function markStockItemsSold(itemIds, buyerPhone) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE stock_items 
    SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  const updateMany = db.transaction((ids) => {
    for (const id of ids) {
      stmt.run(buyerPhone, id);
    }
  });
  updateMany(itemIds);
  db.close();
}

// ==================== PAYMENTS ====================

function createPayment(phone, amount, paymentId, qrCode, qrCodeBase64) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO payments (phone, amount, payment_id, qr_code, qr_code_base64)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(phone, amount, paymentId, qrCode, qrCodeBase64);
  db.close();
  return result.lastInsertRowid;
}

function getPaymentByPaymentId(paymentId) {
  const db = getDb();
  const payment = db.prepare('SELECT * FROM payments WHERE payment_id = ?').get(paymentId);
  db.close();
  return payment;
}

function getPendingPayments() {
  const db = getDb();
  const payments = db.prepare("SELECT * FROM payments WHERE status = 'pending'").all();
  db.close();
  return payments;
}

function updatePaymentStatus(paymentId, status) {
  const db = getDb();
  db.prepare(`
    UPDATE payments 
    SET status = ?, paid_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE paid_at END
    WHERE payment_id = ?
  `).run(status, status, paymentId);
  db.close();
}

function getAllPayments() {
  const db = getDb();
  const payments = db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all();
  db.close();
  return payments;
}

// ==================== PURCHASES ====================

function createPurchase(phone, productId, quantity, totalPrice, itemsDelivered) {
  const db = getDb();
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0];
  
  const stmt = db.prepare(`
    INSERT INTO purchases (phone, product_id, quantity, total_price, items_delivered, purchase_date, purchase_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(phone, productId, quantity, totalPrice, JSON.stringify(itemsDelivered), date, time);
  db.close();
  return result.lastInsertRowid;
}

function getUserPurchases(phone) {
  const db = getDb();
  const purchases = db.prepare(`
    SELECT p.*, pr.name as product_name,
      datetime(p.purchase_date || ' ' || p.purchase_time) as purchase_datetime
    FROM purchases p 
    JOIN products pr ON p.product_id = pr.id 
    WHERE p.phone = ? 
    ORDER BY p.created_at DESC
  `).all(phone);
  db.close();
  return purchases;
}

function getAllPurchases() {
  const db = getDb();
  const purchases = db.prepare(`
    SELECT p.*, pr.name as product_name,
      p.purchase_date, p.purchase_time,
      datetime(p.purchase_date || ' ' || p.purchase_time) as purchase_datetime
    FROM purchases p 
    JOIN products pr ON p.product_id = pr.id 
    ORDER BY p.created_at DESC
  `).all();
  db.close();
  return purchases;
}

// ==================== FEEDBACK ====================

function createFeedback(phone, message, rating = null) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO feedbacks (phone, message, rating) VALUES (?, ?, ?)');
  const result = stmt.run(phone, message, rating);
  db.close();
  return result.lastInsertRowid;
}

function getAllFeedbacks() {
  const db = getDb();
  const feedbacks = db.prepare('SELECT * FROM feedbacks ORDER BY created_at DESC').all();
  db.close();
  return feedbacks;
}

function respondFeedback(id, response) {
  const db = getDb();
  db.prepare(`
    UPDATE feedbacks 
    SET admin_response = ?, status = 'responded', responded_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(response, id);
  db.close();
}

// ==================== SUPPORT ====================

function createSupportTicket(phone, message, subject = null) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO support_tickets (phone, message, subject) VALUES (?, ?, ?)');
  const result = stmt.run(phone, message, subject);
  db.close();
  return result.lastInsertRowid;
}

function getAllSupportTickets() {
  const db = getDb();
  const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
  db.close();
  return tickets;
}

function getOpenSupportTickets() {
  const db = getDb();
  const tickets = db.prepare("SELECT * FROM support_tickets WHERE status = 'open' ORDER BY created_at DESC").all();
  db.close();
  return tickets;
}

function respondSupportTicket(id, response) {
  const db = getDb();
  db.prepare(`
    UPDATE support_tickets 
    SET admin_response = ?, status = 'closed', closed_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(response, id);
  db.close();
}

// ==================== SETTINGS ====================

function getSetting(key) {
  const db = getDb();
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  db.close();
  return setting?.value;
}

function setSetting(key, value) {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, value, value);
  db.close();
}

function getAllSettings() {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings').all();
  db.close();
  return settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
}

// ==================== PANEL ADMINS ====================

function getPanelAdmin(username) {
  const db = getDb();
  const admin = db.prepare('SELECT * FROM panel_admins WHERE username = ?').get(username);
  db.close();
  return admin;
}

function createPanelAdmin(username, hashedPassword) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO panel_admins (username, password) VALUES (?, ?)');
  const result = stmt.run(username, hashedPassword);
  db.close();
  return result.lastInsertRowid;
}

// ==================== STATS ====================

function getStats() {
  const db = getDb();
  const stats = {
    totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    totalProducts: db.prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1').get().count,
    totalCategories: db.prepare('SELECT COUNT(*) as count FROM categories WHERE is_active = 1').get().count,
    totalPurchases: db.prepare('SELECT COUNT(*) as count FROM purchases').get().count,
    totalRevenue: db.prepare('SELECT COALESCE(SUM(total_price), 0) as total FROM purchases').get().total,
    pendingPayments: db.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'").get().count,
    openTickets: db.prepare("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'").get().count,
    pendingFeedbacks: db.prepare("SELECT COUNT(*) as count FROM feedbacks WHERE status = 'pending'").get().count,
    todaySales: db.prepare("SELECT COUNT(*) as count FROM purchases WHERE date(created_at) = date('now')").get().count,
    todayRevenue: db.prepare("SELECT COALESCE(SUM(total_price), 0) as total FROM purchases WHERE date(created_at) = date('now')").get().total,
  };
  db.close();
  return stats;
}

module.exports = {
  // Users
  getUser,
  createUser,
  updateUserBalance,
  setUserBalance,
  isAdmin,
  getAllUsers,
  setAdmin,
  // Categories
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  // Products
  getProducts,
  getProductsByCategory,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStock,
  getLowStockProducts,
  // Stock Items
  addStockItem,
  addStockItems,
  getAvailableStockItems,
  markStockItemsSold,
  // Payments
  createPayment,
  getPaymentByPaymentId,
  getPendingPayments,
  updatePaymentStatus,
  getAllPayments,
  // Purchases
  createPurchase,
  getUserPurchases,
  getAllPurchases,
  // Feedback
  createFeedback,
  getAllFeedbacks,
  respondFeedback,
  // Support
  createSupportTicket,
  getAllSupportTickets,
  getOpenSupportTickets,
  respondSupportTicket,
  // Settings
  getSetting,
  setSetting,
  getAllSettings,
  // Panel Admins
  getPanelAdmin,
  createPanelAdmin,
  // Stats
  getStats,
};
