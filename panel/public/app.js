const API_URL = '';
let token = localStorage.getItem('token');

document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('currentUser').textContent = localStorage.getItem('username') || 'Admin';
    loadDashboard();
  }
  setupForms();
});

function setupForms() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('productForm').addEventListener('submit', handleProductSubmit);
  document.getElementById('stockForm').addEventListener('submit', handleStockSubmit);
  document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);
  document.getElementById('balanceForm').addEventListener('submit', handleBalanceSubmit);
  document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
}

// Auth
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (res.ok) {
      token = data.token;
      localStorage.setItem('token', token);
      localStorage.setItem('username', data.username);
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      document.getElementById('currentUser').textContent = data.username;
      loadDashboard();
    } else {
      document.getElementById('loginError').textContent = data.error || 'Erro ao fazer login';
      document.getElementById('loginError').classList.remove('hidden');
    }
  } catch (err) {
    document.getElementById('loginError').textContent = 'Erro de conexao';
    document.getElementById('loginError').classList.remove('hidden');
  }
}

function logout() {
  token = null;
  localStorage.clear();
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

// API
async function api(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  if (res.status === 401) { logout(); throw new Error('Sessao expirada'); }
  return res.json();
}

// Navigation
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${name}`).classList.remove('hidden');
  
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.remove('active');
    if (l.dataset.section === name) l.classList.add('active');
  });
  
  const titles = { dashboard: 'Dashboard', products: 'Produtos', categories: 'Categorias', users: 'Usuarios', sales: 'Vendas', payments: 'Pagamentos', tickets: 'Suporte', settings: 'Config' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  
  const loaders = { dashboard: loadDashboard, products: loadProducts, categories: loadCategories, users: loadUsers, sales: loadSales, payments: loadPayments, tickets: loadTickets, settings: loadSettings };
  if (loaders[name]) loaders[name]();
}

// Modals
function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); }

// Dashboard
async function loadDashboard() {
  try {
    const stats = await api('/api/stats');
    document.getElementById('stat-users').textContent = stats.totalUsers;
    document.getElementById('stat-products').textContent = stats.totalProducts;
    document.getElementById('stat-todaySales').textContent = stats.todaySales;
    document.getElementById('stat-todayRevenue').textContent = `R$${stats.todayRevenue.toFixed(2)}`;
    document.getElementById('stat-totalPurchases').textContent = stats.totalPurchases;
    document.getElementById('stat-totalRevenue').textContent = `R$${stats.totalRevenue.toFixed(2)}`;
    document.getElementById('stat-categories').textContent = stats.totalCategories;
    document.getElementById('stat-pendingPayments').textContent = stats.pendingPayments;
    document.getElementById('stat-openTickets').textContent = stats.openTickets;
    document.getElementById('stat-pendingFeedbacks').textContent = stats.pendingFeedbacks;
  } catch (e) { console.error(e); }
}

// Products
async function loadProducts() {
  try {
    const products = await api('/api/products');
    document.getElementById('productsTable').innerHTML = products.map(p => `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4">${p.id}</td>
        <td class="px-6 py-4 font-medium">${p.name}</td>
        <td class="px-6 py-4">${p.category || 'Geral'}</td>
        <td class="px-6 py-4">R$${p.price.toFixed(2)}</td>
        <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs ${p.available_stock <= 5 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${p.available_stock}</span></td>
        <td class="px-6 py-4 space-x-2">
          <button onclick="openStockModal(${p.id})" class="text-green-600 hover:underline">+Estoque</button>
          <button onclick="editProduct(${p.id})" class="text-blue-600 hover:underline">Editar</button>
          <button onclick="deleteProduct(${p.id})" class="text-red-600 hover:underline">Excluir</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const data = {
    name: document.getElementById('productName').value,
    price: parseFloat(document.getElementById('productPrice').value),
    category: document.getElementById('productCategory').value || 'Geral',
    description1: document.getElementById('productDesc1').value,
    description2: document.getElementById('productDesc2').value,
    banner_url: document.getElementById('productBanner').value
  };
  
  try {
    if (id) await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    closeModal('productModal');
    loadProducts();
  } catch (e) { alert('Erro ao salvar'); }
}

async function editProduct(id) {
  const products = await api('/api/products');
  const p = products.find(x => x.id === id);
  if (p) {
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productCategory').value = p.category || '';
    document.getElementById('productDesc1').value = p.description1 || '';
    document.getElementById('productDesc2').value = p.description2 || '';
    document.getElementById('productBanner').value = p.banner_url || '';
    openModal('productModal');
  }
}

async function deleteProduct(id) {
  if (!confirm('Excluir produto?')) return;
  try { await api(`/api/products/${id}`, { method: 'DELETE' }); loadProducts(); }
  catch (e) { alert('Erro ao excluir'); }
}

function openStockModal(id) {
  document.getElementById('stockProductId').value = id;
  document.getElementById('stockItems').value = '';
  openModal('stockModal');
}

async function handleStockSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('stockProductId').value;
  const items = document.getElementById('stockItems').value.split('\n').map(i => i.trim()).filter(i => i);
  if (!items.length) { alert('Adicione itens'); return; }
  
  try {
    await api(`/api/products/${id}/stock`, { method: 'POST', body: JSON.stringify({ items }) });
    closeModal('stockModal');
    loadProducts();
    alert(`${items.length} itens adicionados!`);
  } catch (e) { alert('Erro'); }
}

// Categories
async function loadCategories() {
  try {
    const cats = await api('/api/categories');
    document.getElementById('categoriesGrid').innerHTML = cats.map(c => `
      <div class="bg-white rounded-xl p-6 shadow-sm card">
        ${c.banner_url ? `<img src="${c.banner_url}" class="w-full h-32 object-cover rounded-lg mb-4">` : ''}
        <h4 class="font-semibold text-lg">${c.name}</h4>
        <p class="text-gray-500 text-sm mb-4">${c.description || 'Sem descricao'}</p>
        <div class="flex gap-2">
          <button onclick="editCategory(${c.id})" class="text-blue-600 hover:underline text-sm">Editar</button>
          <button onclick="deleteCategory(${c.id})" class="text-red-600 hover:underline text-sm">Excluir</button>
        </div>
      </div>
    `).join('') || '<p class="text-gray-500">Nenhuma categoria</p>';
  } catch (e) { console.error(e); }
}

async function handleCategorySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const data = {
    name: document.getElementById('categoryName').value,
    description: document.getElementById('categoryDescription').value,
    banner_url: document.getElementById('categoryBanner').value
  };
  
  try {
    if (id) await api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/categories', { method: 'POST', body: JSON.stringify(data) });
    closeModal('categoryModal');
    loadCategories();
  } catch (e) { alert('Erro ao salvar'); }
}

async function editCategory(id) {
  const cats = await api('/api/categories');
  const c = cats.find(x => x.id === id);
  if (c) {
    document.getElementById('categoryId').value = c.id;
    document.getElementById('categoryName').value = c.name;
    document.getElementById('categoryDescription').value = c.description || '';
    document.getElementById('categoryBanner').value = c.banner_url || '';
    openModal('categoryModal');
  }
}

async function deleteCategory(id) {
  if (!confirm('Excluir categoria?')) return;
  try { await api(`/api/categories/${id}`, { method: 'DELETE' }); loadCategories(); }
  catch (e) { alert('Erro ao excluir'); }
}

// Users
async function loadUsers() {
  try {
    const users = await api('/api/users');
    document.getElementById('usersTable').innerHTML = users.map(u => `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4">${u.phone}</td>
        <td class="px-6 py-4 font-medium">R$${u.balance.toFixed(2)}</td>
        <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs ${u.is_admin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100'}">${u.is_admin ? 'Sim' : 'Nao'}</span></td>
        <td class="px-6 py-4 space-x-2">
          <button onclick="openBalanceModal('${u.phone}')" class="text-green-600 hover:underline">+Saldo</button>
          <button onclick="toggleAdmin('${u.phone}', ${!u.is_admin})" class="text-blue-600 hover:underline">${u.is_admin ? 'Remover Admin' : 'Tornar Admin'}</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

function openBalanceModal(phone) {
  document.getElementById('balancePhone').value = phone;
  document.getElementById('balanceAmount').value = '';
  openModal('balanceModal');
}

async function handleBalanceSubmit(e) {
  e.preventDefault();
  const phone = document.getElementById('balancePhone').value;
  const amount = parseFloat(document.getElementById('balanceAmount').value);
  
  try {
    await api(`/api/users/${phone}/balance`, { method: 'PUT', body: JSON.stringify({ amount }) });
    closeModal('balanceModal');
    loadUsers();
    alert('Saldo adicionado!');
  } catch (e) { alert('Erro'); }
}

async function toggleAdmin(phone, isAdmin) {
  try { await api(`/api/users/${phone}/admin`, { method: 'PUT', body: JSON.stringify({ isAdmin }) }); loadUsers(); }
  catch (e) { alert('Erro'); }
}

// Sales
async function loadSales() {
  try {
    const sales = await api('/api/purchases');
    document.getElementById('salesTable').innerHTML = sales.map(s => {
      let dateTime = 'N/A';
      if (s.purchase_date && s.purchase_time) {
        dateTime = `${s.purchase_date} ${s.purchase_time}`;
      } else if (s.created_at) {
        dateTime = new Date(s.created_at).toLocaleString('pt-BR');
      }
      return `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4">${s.id}</td>
        <td class="px-6 py-4 font-medium">${s.product_name}</td>
        <td class="px-6 py-4">${s.phone}</td>
        <td class="px-6 py-4">${s.quantity}</td>
        <td class="px-6 py-4">R$${s.total_price.toFixed(2)}</td>
        <td class="px-6 py-4">${dateTime}</td>
      </tr>
    `}).join('');
  } catch (e) { console.error(e); }
}

// Payments
async function loadPayments() {
  try {
    const payments = await api('/api/payments');
    const statusColors = { pending: 'bg-yellow-100 text-yellow-800', approved: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800', rejected: 'bg-red-100 text-red-800' };
    const statusLabels = { pending: 'Pendente', approved: 'Aprovado', cancelled: 'Cancelado', rejected: 'Rejeitado' };
    
    document.getElementById('paymentsTable').innerHTML = payments.map(p => `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4">${p.id}</td>
        <td class="px-6 py-4">${p.phone}</td>
        <td class="px-6 py-4 font-medium">R$${p.amount.toFixed(2)}</td>
        <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs ${statusColors[p.status]}">${statusLabels[p.status]}</span></td>
        <td class="px-6 py-4">${new Date(p.created_at).toLocaleString('pt-BR')}</td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

// Tickets
async function loadTickets() {
  try {
    const tickets = await api('/api/tickets');
    document.getElementById('ticketsTable').innerHTML = tickets.map(t => `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4">${t.id}</td>
        <td class="px-6 py-4">${t.phone}</td>
        <td class="px-6 py-4 max-w-xs truncate">${t.message}</td>
        <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs ${t.status === 'open' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${t.status === 'open' ? 'Aberto' : 'Fechado'}</span></td>
        <td class="px-6 py-4">${new Date(t.created_at).toLocaleString('pt-BR')}</td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

// Settings
async function loadSettings() {
  try {
    const settings = await api('/api/settings');
    document.getElementById('setting-bot_name').value = settings.bot_name || '';
    document.getElementById('setting-pix_key').value = settings.pix_key || '';
    document.getElementById('setting-welcome_message').value = settings.welcome_message || '';
    document.getElementById('setting-low_stock_threshold').value = settings.low_stock_threshold || '5';
  } catch (e) { console.error(e); }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const data = {
    bot_name: document.getElementById('setting-bot_name').value,
    pix_key: document.getElementById('setting-pix_key').value,
    welcome_message: document.getElementById('setting-welcome_message').value,
    low_stock_threshold: document.getElementById('setting-low_stock_threshold').value
  };
  
  try { await api('/api/settings', { method: 'PUT', body: JSON.stringify(data) }); alert('Configuracoes salvas!'); }
  catch (e) { alert('Erro ao salvar'); }
}
