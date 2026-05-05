const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'sabiostore.db');

function initDatabase() {
  const db = new Database(dbPath);
  
  // Tabela de usuarios
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      balance REAL DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de categorias
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      banner_url TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de produtos
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description1 TEXT,
      description2 TEXT,
      description3 TEXT,
      description4 TEXT,
      price REAL NOT NULL,
      quantity INTEGER DEFAULT 0,
      banner_url TEXT,
      category_id INTEGER,
      category TEXT DEFAULT 'Geral',
      is_active INTEGER DEFAULT 1,
      low_stock_alert INTEGER DEFAULT 5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // Tabela de itens do estoque
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_sold INTEGER DEFAULT 0,
      sold_to TEXT,
      sold_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Tabela de pagamentos
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_id TEXT UNIQUE,
      qr_code TEXT,
      qr_code_base64 TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      FOREIGN KEY (phone) REFERENCES users(phone)
    )
  `);

  // Tabela de compras com horario
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      total_price REAL NOT NULL,
      items_delivered TEXT,
      purchase_date DATE DEFAULT (date('now')),
      purchase_time TIME DEFAULT (time('now', 'localtime')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (phone) REFERENCES users(phone),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Tabela de feedback
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      rating INTEGER,
      status TEXT DEFAULT 'pending',
      admin_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      FOREIGN KEY (phone) REFERENCES users(phone)
    )
  `);

  // Tabela de suporte
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      admin_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (phone) REFERENCES users(phone)
    )
  `);

  // Tabela de configuracoes
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de admins do painel
  db.exec(`
    CREATE TABLE IF NOT EXISTS panel_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inserir admins padrao do bot
  const insertAdmin = db.prepare(`
    INSERT OR IGNORE INTO users (phone, name, is_admin) VALUES (?, ?, 1)
  `);
  insertAdmin.run('5571993003691', 'Admin 01');
  insertAdmin.run('12894351530', 'Admin 02');

  // Inserir categorias padrao
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name, description, sort_order) VALUES (?, ?, ?)
  `);
  insertCategory.run('Streaming', 'Contas de streaming', 1);
  insertCategory.run('Games', 'Contas de jogos', 2);
  insertCategory.run('Redes Sociais', 'Contas de redes sociais', 3);
  insertCategory.run('Outros', 'Outros produtos', 4);

  // Inserir configuracoes padrao
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  insertSetting.run('bot_name', 'SabioStore');
  insertSetting.run('welcome_message', 'Bem-vindo ao SabioStore! Digite /menu para ver as opcoes.');
  insertSetting.run('low_stock_threshold', '5');
  insertSetting.run('pix_key', 'patinhasqueprecisam@gmail.com');

  db.close();
  console.log('Database initialized successfully!');
}

function getDb() {
  return new Database(dbPath);
}

module.exports = { initDatabase, getDb, dbPath };
