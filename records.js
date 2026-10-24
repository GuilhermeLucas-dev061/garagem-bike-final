/* Compras e pedidos da loja: regras de negócio sobre as coleções do banco (storage.col*).
   Cada registro é gravado sozinho; o estoque e as vendas (bloco de dados da oficina) só mudam
   quando o dono entrega o pedido. */

const crypto = require('crypto');
const storage = require('./storage');
const rules = require('./rules');

const ORDER_STATUS = ['Solicitado', 'Pronto para retirada', 'Entregue', 'Cancelado'];
const MAX_QTY = 20;
const MAX_OPEN_ORDERS = 30; /* por cliente: evita encher o banco com pedidos em aberto */

const fail = (status, message) => Object.assign(new Error(message), { status });
const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

/* ---------- Compras de fornecedores (dono) ---------- */

async function listPurchases() {
  return (await storage.colList('purchases')).sort((a, b) => String(b.date).localeCompare(String(a.date)) || byNewest(a, b));
}

/* Registra a compra e, se ela for de uma peça cadastrada, dá entrada no estoque */
async function createPurchase(body) {
  const item = rules.str(body.item, 120);
  const productId = Number(body.productId);
  if (!item && !(Number.isSafeInteger(productId) && productId > 0)) throw fail(400, 'Informe o item comprado.');
  const qty = Math.max(1, Math.floor(rules.amount(body.qty)) || 1);
  const price = rules.money(body.price);
  const record = {
    id: crypto.randomUUID(), item, supplier: rules.str(body.supplier, 120), qty, price,
    date: rules.isoDate(body.date), note: rules.str(body.note, 300), productId: null, createdAt: new Date().toISOString()
  };
  if (Number.isSafeInteger(productId) && productId > 0) {
    const db = await storage.loadDb(rules.seed);
    const product = db.products.find((p) => p.id === productId);
    if (!product) throw fail(400, 'Peça não encontrada.');
    product.stock += qty;
    record.productId = product.id;
    record.item = product.name;
    await storage.saveDb(db);
  }
  await storage.colPut('purchases', record);
  return record;
}

async function deletePurchase(id) {
  if (!(await storage.colGet('purchases', id))) throw fail(404, 'Compra não encontrada.');
  await storage.colDel('purchases', id);
}

/* Compras antigas moravam dentro do bloco de dados: move para a coleção, uma única vez */
async function migrateLegacyPurchases() {
  const db = await storage.loadDb(rules.seed);
  if (!Array.isArray(db.purchases)) return;
  for (const p of db.purchases) {
    await storage.colPut('purchases', {
      id: `legacy-${p.id}`, item: rules.str(p.item, 120), supplier: rules.str(p.supplier, 120), qty: 1,
      price: rules.money(p.price), date: rules.isoDate(p.date), note: '', productId: null, createdAt: `${rules.isoDate(p.date)}T00:00:00.000Z`
    });
  }
  delete db.purchases;
  await storage.saveDb(db);
}

/* ---------- Pedidos da loja (clientes) ---------- */

async function listOrders(user) {
  const all = await storage.colList('orders');
  return (user.role === 'owner' ? all : all.filter((o) => o.userId === user.id)).sort(byNewest);
}

/* Preço e nome vêm do cadastro no servidor, nunca do navegador */
async function createOrder(user, body) {
  const db = await storage.loadDb(rules.seed);
  const product = db.products.find((p) => p.id === Number(body.productId));
  if (!product) throw fail(400, 'Produto não encontrado.');
  const qty = Math.floor(rules.amount(body.qty)) || 1;
  if (qty < 1 || qty > MAX_QTY) throw fail(400, `A quantidade deve ficar entre 1 e ${MAX_QTY}.`);
  if (product.stock < qty) throw fail(400, product.stock < 1 ? 'Produto indisponível no estoque.' : `Só temos ${product.stock} em estoque.`);
  const open = (await storage.colList('orders')).filter((o) => o.userId === user.id && (o.status === 'Solicitado' || o.status === 'Pronto para retirada'));
  if (open.length >= MAX_OPEN_ORDERS) throw fail(400, 'Você já tem muitos pedidos em aberto.');
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(), userId: user.id, customer: user.name, productId: product.id, item: product.name,
    qty, unitPrice: product.price, total: Math.round(product.price * qty * 100) / 100, status: 'Solicitado',
    note: rules.str(body.note, 200), createdAt: now, updatedAt: now
  };
  await storage.colPut('orders', record);
  return record;
}

/* Cliente só cancela o próprio pedido ainda não atendido; o dono faz qualquer passo válido.
   "Entregue" baixa o estoque e lança a venda (com custo vindo do cadastro). */
async function changeOrderStatus(user, id, status) {
  if (!ORDER_STATUS.includes(status)) throw fail(400, 'Situação inválida.');
  const order = await storage.colGet('orders', id);
  if (!order || (user.role !== 'owner' && order.userId !== user.id)) throw fail(404, 'Pedido não encontrado.');
  if (order.status === 'Entregue' || order.status === 'Cancelado') throw fail(400, `Este pedido já está ${order.status.toLowerCase()}.`);
  if (user.role !== 'owner' && !(status === 'Cancelado' && order.status === 'Solicitado')) throw fail(403, 'Você só pode cancelar pedidos ainda não atendidos.');
  if (status === order.status) return order;

  if (status === 'Entregue') {
    const db = await storage.loadDb(rules.seed);
    const product = db.products.find((p) => p.id === order.productId);
    if (!product) throw fail(400, 'A peça deste pedido não está mais cadastrada.');
    if (product.stock < order.qty) throw fail(400, `Estoque insuficiente: restam ${product.stock}.`);
    product.stock -= order.qty;
    const used = new Set(db.sales.map((s) => s.id));
    let saleId = Date.now();
    while (used.has(saleId)) saleId += 1;
    db.sales.unshift({ id: saleId, orderId: order.id, item: order.item, qty: order.qty, price: order.unitPrice, cost: product.cost, date: rules.localDate(), customer: order.customer });
    await storage.saveDb(db);
  }
  const next = { ...order, status, updatedAt: new Date().toISOString() };
  await storage.colPut('orders', next);
  return next;
}

module.exports = { ORDER_STATUS, listPurchases, createPurchase, deletePurchase, migrateLegacyPurchases, listOrders, createOrder, changeOrderStatus };
