/* Regras de acesso aos dados, aplicadas SEMPRE no servidor:
   o que cada perfil enxerga (viewFor) e o que cada perfil pode gravar (applyChanges).
   Nada que o navegador envia é confiado sem validação. */

const JOB_STATUS = ['Aguardando', 'Em andamento', 'Pronta', 'Concluído'];
const JOB_TYPES = ['Manutenção', 'Revisão', 'Ajuste'];
const UNASSIGNED = 'A definir';
const PRIORITIES = ['Normal', 'Alta', 'Baixa'];
const REQUEST_STATUS = ['Solicitado', 'Recebido'];
const MAX_ITEMS = 5000;
const MAX_OWN_JOBS = 50;

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- Estado inicial: sistema limpo, sem dados de exemplo ---------- */

const DEFAULT_GOAL = 5000;

function seed() {
  return { products: [], jobs: [], sales: [], expenses: [], requests: [], goal: DEFAULT_GOAL };
}

/* ---------- Validação ---------- */

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : 0; };
const amount = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : 0; };
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : localDate());
const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);

/* Garante ids inteiros, positivos e únicos dentro da lista */
function uniqueId(candidate, used) {
  let id = Number.isSafeInteger(candidate) && candidate > 0 ? candidate : Date.now();
  while (used.has(id)) id += 1;
  used.add(id);
  return id;
}

function cleanList(incoming, clean) {
  const used = new Set();
  return list(incoming).filter((x) => x && typeof x === 'object').map((x) => ({ ...clean(x), id: uniqueId(x.id, used) }));
}

const cleanProduct = (p) => ({ name: str(p.name), category: str(p.category), price: money(p.price), cost: money(p.cost), stock: amount(p.stock) });
const cleanSale = (s) => ({ item: str(s.item), qty: amount(s.qty), price: money(s.price), cost: money(s.cost), date: isoDate(s.date), customer: str(s.customer) || 'Cliente balcão' });
const cleanExpense = (e) => ({ item: str(e.item), category: str(e.category), price: money(e.price), date: isoDate(e.date) });
const cleanRequest = (r) => ({ item: str(r.item), qty: amount(r.qty), priority: oneOf(r.priority, PRIORITIES, 'Normal'), status: oneOf(r.status, REQUEST_STATUS, 'Solicitado'), date: isoDate(r.date) });

/* O vínculo job -> conta do cliente (userId) só existe no servidor: nunca vem do navegador */
/* Mecânico válido = conta com perfil de mecânico hoje, ou quem já estava na ordem (não perde o histórico) */
function cleanJobs(incoming, existing, mechanics = []) {
  const owners = new Map(existing.map((j) => [j.id, j.userId]));
  const previous = new Map(existing.map((j) => [j.id, j.mechanic]));
  const pickMechanic = (j) => (j.mechanic === UNASSIGNED || mechanics.includes(j.mechanic) || previous.get(j.id) === j.mechanic ? str(j.mechanic, 80) || UNASSIGNED : UNASSIGNED);
  return cleanList(incoming, (j) => ({
    bike: str(j.bike), customer: str(j.customer), type: oneOf(j.type, JOB_TYPES, 'Manutenção'), service: str(j.service, 300),
    mechanic: pickMechanic(j), status: oneOf(j.status, JOB_STATUS, 'Aguardando'), date: isoDate(j.date), price: money(j.price)
  })).map((job) => (owners.get(job.id) ? { ...job, userId: owners.get(job.id) } : job));
}

/* ---------- O que cada perfil enxerga ---------- */

const withoutCost = ({ cost, ...rest }) => rest;
const empty = { sales: [], expenses: [], requests: [], goal: 0 };

function viewFor(user, db, mechanics = []) {
  const { purchases, ...base } = db; /* compras migradas para a coleção própria (ver app.js) */
  return { ...shape(user, base), mechanics };
}

function shape(user, db) {
  if (user.role === 'owner') return db;
  if (user.role === 'mechanic') {
    return { ...empty, products: db.products.map(withoutCost), jobs: db.jobs.map(({ userId, ...rest }) => rest), requests: db.requests };
  }
  return { ...empty, products: db.products.map(withoutCost), jobs: db.jobs.filter((j) => j.userId === user.id).map(({ userId, ...rest }) => rest) };
}

/* ---------- O que cada perfil pode gravar ---------- */

function applyChanges(user, incoming, db, mechanics = []) {
  const data = incoming && typeof incoming === 'object' ? incoming : {};

  if (user.role === 'owner') {
    return {
      products: cleanList(data.products, cleanProduct),
      jobs: cleanJobs(data.jobs, db.jobs, mechanics),
      sales: cleanList(data.sales, cleanSale),
      expenses: cleanList(data.expenses, cleanExpense),
      requests: cleanList(data.requests, cleanRequest),
      goal: Math.max(1, money(data.goal) || db.goal)
    };
  }

  if (user.role === 'mechanic') {
    /* Mecânico: ordens, pedidos de peças e quantidade em estoque. Preço e custo ficam como estão. */
    const stock = new Map(list(data.products).filter((p) => p && typeof p === 'object').map((p) => [p.id, amount(p.stock)]));
    return {
      ...db,
      products: db.products.map((p) => (stock.has(p.id) ? { ...p, stock: stock.get(p.id) } : p)),
      jobs: cleanJobs(data.jobs, db.jobs, mechanics),
      requests: cleanList(data.requests, cleanRequest)
    };
  }

  /* Cliente: só pode criar pedidos de serviço (as compras da loja têm rota própria: /api/orders). Nada existente é alterado. */
  const next = { ...db, products: db.products.map((p) => ({ ...p })), jobs: [...db.jobs], sales: [...db.sales] };
  const usedJobs = new Set(db.jobs.map((j) => j.id));
  /* id do servidor ou id que o navegador usou ao criar (cid): evita duplicar se o mesmo envio chegar duas vezes */
  const knownJobs = new Set(db.jobs.filter((j) => j.userId === user.id).flatMap((j) => [j.id, j.cid]));

  const room = Math.max(0, MAX_OWN_JOBS - db.jobs.filter((j) => j.userId === user.id).length);
  list(data.jobs).filter((j) => j && typeof j === 'object' && !knownJobs.has(j.id)).slice(0, room).forEach((j) => {
    next.jobs.unshift({
      id: uniqueId(Date.now(), usedJobs), cid: j.id, userId: user.id,
      bike: str(j.bike), customer: user.name, type: oneOf(j.type, JOB_TYPES, 'Manutenção'), service: str(j.service, 300) || 'Serviço solicitado',
      mechanic: mechanics.includes(j.mechanic) ? j.mechanic : UNASSIGNED, status: 'Aguardando', date: isoDate(j.date), price: 0
    });
  });

  return next;
}

module.exports = { seed, viewFor, applyChanges, str, money, amount, isoDate, localDate };
