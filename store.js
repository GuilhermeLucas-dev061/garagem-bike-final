/* Dados no navegador.
   A fonte da verdade é o servidor: cada perfil recebe só o que pode ver (/api/data) e as
   gravações são validadas lá. Aqui fica uma cópia de trabalho (db) e as consultas compartilhadas. */

const LOW_STOCK_LIMIT = 5;
const SERVICE_TYPES = ['Manutenção', 'Revisão', 'Ajuste'];

/* Data local no formato AAAA-MM-DD.
   toISOString() usa UTC e, à noite no Brasil, já devolveria o dia seguinte. */
function dateNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let db = { products: [], jobs: [], sales: [], expenses: [], requests: [], goal: 0, mechanics: [] };
/* Mecânicos = contas com perfil de mecânico (a lista vem do servidor) */
const mechanicNames = () => db.mechanics || [];
/* Carregados sob demanda, com a tela que os usa */
let purchases = [];
let orders = [];
let currentUser = null;

/* Chamada à API. Sessão expirada (401) volta para o login. */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'garagem' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/login')) {
    window.location.href = '/login.html';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

async function loadData() {
  db = await api('GET', '/api/data');
}

/* Grava em segundo plano: a tela atualiza na hora e o servidor confirma. Se falhar, recarrega os dados reais. */
let pendingSaves = 0;
let saveChain = Promise.resolve();

function save() {
  pendingSaves += 1;
  const snapshot = JSON.parse(JSON.stringify(db));
  saveChain = saveChain
    .then(() => api('PUT', '/api/data', snapshot))
    .then((fresh) => {
      pendingSaves -= 1;
      if (!pendingSaves && JSON.stringify(fresh) !== JSON.stringify(db)) {
        db = fresh;
        render();
      }
    })
    .catch(async () => {
      pendingSaves -= 1;
      toast('Não foi possível salvar. Os dados foram recarregados.', 'error');
      try { db = await api('GET', '/api/data'); render(); } catch (e) { /* sessão expirada: já redirecionou */ }
    });
  return true;
}

/* Consultas usadas por mais de uma tela */
const isReady = (job) => job.status === 'Pronta' || job.status === 'Concluído';
const isOpen = (job) => !isReady(job);
const isLowStock = (product) => product.stock <= LOW_STOCK_LIMIT;
const isPendingRequest = (request) => request.status !== 'Recebido';
const totalRevenue = () => db.sales.reduce((sum, s) => sum + s.price * s.qty, 0);
const totalCost = () => db.sales.reduce((sum, s) => sum + s.cost * s.qty, 0);
