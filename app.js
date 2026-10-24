/* Aplicação HTTP da Garagem Bike: login, sessões, API de dados e arquivos estáticos.
   Exporta handle(req, res): roda tanto no servidor local (server/index.js) quanto como
   função da Vercel (api/index.js). Sem dependências: só módulos nativos do Node. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const security = require('./security');
const storage = require('./storage');
const rules = require('./rules');
const records = require('./records');
const prices = require('./prices');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE = 'gb_session';
const ROLES = ['owner', 'mechanic', 'customer'];
const ON_VERCEL = Boolean(process.env.VERCEL);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

/* ---------- Utilidades ---------- */

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

const fail = (res, status, message, headers) => sendJson(res, status, { error: message }, headers);

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

const BODY_LIMIT = 1024 * 1024;

function readBody(req, limit = BODY_LIMIT) {
  /* Na Vercel o corpo JSON já chega interpretado em req.body */
  if (req.body !== undefined && req.body !== null) {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
      const size = typeof raw === 'string' ? Buffer.byteLength(raw) : Buffer.byteLength(JSON.stringify(raw));
      if (size > limit) return Promise.reject(Object.assign(new Error('Corpo grande demais'), { status: 413 }));
      return Promise.resolve(typeof raw === 'string' ? (raw ? JSON.parse(raw) : {}) : raw);
    } catch (e) {
      return Promise.reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (tooBig) return;
      if (size > limit) {
        tooBig = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Corpo grande demais'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const isSecure = (req) => process.env.COOKIE_SECURE === '1' || ON_VERCEL || req.headers['x-forwarded-proto'] === 'https';

/* Atrás de proxy (Vercel) o IP real vem em x-forwarded-for */
function clientIp(req) {
  if (ON_VERCEL || process.env.TRUST_PROXY === '1') return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconhecido';
  return req.socket.remoteAddress;
}

function sessionCookie(req, token, maxAgeSeconds) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${isSecure(req) ? '; Secure' : ''}`;
}

async function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  return token ? security.userFromToken(token, await storage.loadUsers()) : null;
}

const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });
const listUsers = (users) => users.map((u) => ({ ...publicUser(u), createdAt: u.createdAt }));

/* Lê, altera e grava de uma vez (sem esperar nada no meio) para não perder alterações simultâneas */
async function updateUsers(change) {
  const users = await storage.loadUsers();
  const result = await change(users);
  await storage.saveUsers(users);
  return result;
}

/* Nomes dos mecânicos = contas com perfil de mecânico. Mudar o perfil de alguém muda esta lista. */
const mechanicNames = (users) => users.filter((u) => u.role === 'mechanic').map((u) => u.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* Carrega os dados da oficina; compras antigas (que viviam dentro do bloco) são movidas para o banco de compras */
async function loadDbMigrated() {
  let db = await storage.loadDb(rules.seed);
  if (Array.isArray(db.purchases)) {
    await records.migrateLegacyPurchases();
    db = await storage.loadDb(rules.seed);
  }
  return db;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateAccount({ name, email, password }, users) {
  const cleanName = rules.str(name, 80);
  const cleanEmail = rules.str(email, 120).toLowerCase();
  if (cleanName.length < 2) return { error: 'Informe o nome completo.' };
  if (!EMAIL.test(cleanEmail)) return { error: 'Informe um e-mail válido.' };
  if (typeof password !== 'string' || password.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.' };
  if (password.length > 200) return { error: 'Senha longa demais.' };
  if (users.some((u) => u.email === cleanEmail)) return { error: 'Já existe uma conta com esse e-mail.' };
  return { name: cleanName, email: cleanEmail };
}

/* Cria a conta; confere o e-mail de novo ao gravar, pois o hash da senha leva alguns instantes */
async function addUser(account, password, role) {
  const passwordHash = await security.hashPassword(password);
  return updateUsers((users) => {
    if (users.some((u) => u.email === account.email)) throw Object.assign(new Error('Já existe uma conta com esse e-mail.'), { status: 400 });
    if (role === 'owner' && users.length && !users.some((u) => u.role === 'owner')) throw Object.assign(new Error('Operação inválida.'), { status: 400 });
    const user = { id: crypto.randomUUID(), name: account.name, email: account.email, role, passwordHash, sv: 0, createdAt: new Date().toISOString() };
    users.push(user);
    return user;
  });
}

async function startSession(req, res, user, status = 200) {
  const token = await security.createToken(user);
  sendJson(res, status, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, token, security.SESSION_HOURS * 3600) });
}

/* ---------- API ---------- */

async function handleApi(req, res, pathname) {
  const route = `${req.method} ${pathname}`;

  /* Defesa contra CSRF: além do cookie SameSite=Strict, exige cabeçalho próprio em escritas */
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return fail(res, 403, 'Origem não permitida.');
    if (req.headers['x-requested-with'] !== 'garagem') return fail(res, 403, 'Requisição não permitida.');
  }

  if (route === 'GET /api/status') return sendJson(res, 200, { needsSetup: (await storage.loadUsers()).length === 0, loggedIn: Boolean(await currentUser(req)) });

  if (route === 'POST /api/setup') {
    const users = await storage.loadUsers();
    if (users.length) return fail(res, 403, 'A conta do dono já foi criada.');
    const body = await readBody(req);
    const account = validateAccount(body, users);
    if (account.error) return fail(res, 400, account.error);
    const user = await addUser(account, body.password, 'owner');
    return startSession(req, res, user, 201);
  }

  if (route === 'POST /api/login') {
    const body = await readBody(req);
    const email = rules.str(body.email, 120).toLowerCase();
    const keys = [`ip:${clientIp(req)}`, `acct:${email}`];
    const locked = await security.lockedMinutes(keys);
    if (locked) return fail(res, 429, `Muitas tentativas. Tente novamente em ${locked} minuto(s).`);
    const user = (await storage.loadUsers()).find((u) => u.email === email);
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const ok = user ? await security.verifyPassword(password, user.passwordHash) : (await security.burnTime(password), false);
    if (!ok) {
      await security.registerFail(keys);
      return fail(res, 401, 'E-mail ou senha incorretos.');
    }
    await security.clearFails(keys);
    return startSession(req, res, user);
  }

  if (route === 'POST /api/register') {
    const users = await storage.loadUsers();
    if (!users.length) return fail(res, 403, 'Crie primeiro a conta do dono.');
    const body = await readBody(req);
    const account = validateAccount(body, users);
    if (account.error) return fail(res, 400, account.error);
    const user = await addUser(account, body.password, 'customer');
    return startSession(req, res, user, 201);
  }

  /* A partir daqui é preciso estar logado */
  const user = await currentUser(req);
  if (!user) return fail(res, 401, 'Sessão expirada. Entre novamente.');

  if (route === 'GET /api/session') return sendJson(res, 200, { user: publicUser(user) });

  if (route === 'POST /api/logout') {
    /* Sair invalida todas as sessões desta conta (contador sv) */
    await updateUsers((users) => { const u = users.find((x) => x.id === user.id); if (u) u.sv = (u.sv || 0) + 1; });
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (route === 'GET /api/data') {
    const [db, users] = await Promise.all([loadDbMigrated(), storage.loadUsers()]);
    return sendJson(res, 200, rules.viewFor(user, db, mechanicNames(users)));
  }

  if (route === 'PUT /api/data') {
    const body = await readBody(req);
    const mechanics = mechanicNames(await storage.loadUsers());
    const next = rules.applyChanges(user, body, await loadDbMigrated(), mechanics);
    await storage.saveDb(next);
    return sendJson(res, 200, rules.viewFor(user, next, mechanics));
  }

  /* ----- Comparador de preços (dono e mecânico) ----- */
  if (route === 'GET /api/prices') {
    if (user.role === 'customer') return fail(res, 403, 'Disponível apenas para a equipe.');
    return sendJson(res, 200, await prices.searchPrices(new URL(req.url, 'http://localhost').searchParams.get('q')));
  }

  /* ----- Pedidos da loja: cliente cria e cancela; dono acompanha e entrega ----- */
  if (route === 'GET /api/orders') {
    if (user.role === 'mechanic') return fail(res, 403, 'Sem permissão.');
    return sendJson(res, 200, { orders: await records.listOrders(user) });
  }
  if (route === 'POST /api/orders') {
    if (user.role === 'mechanic') return fail(res, 403, 'Sem permissão.');
    const order = await records.createOrder(user, await readBody(req));
    return sendJson(res, 201, { order, orders: await records.listOrders(user) });
  }
  const orderMatch = pathname.match(/^\/api\/orders\/([0-9a-f-]{36})$/);
  if (orderMatch && req.method === 'PATCH') {
    if (user.role === 'mechanic') return fail(res, 403, 'Sem permissão.');
    const body = await readBody(req);
    await records.changeOrderStatus(user, orderMatch[1], body.status);
    return sendJson(res, 200, { orders: await records.listOrders(user) });
  }

  /* ----- Compras de fornecedores: só o dono ----- */
  if (pathname.startsWith('/api/purchases')) {
    if (user.role !== 'owner') return fail(res, 403, 'Apenas o dono pode ver as compras.');
    if (route === 'GET /api/purchases') { await loadDbMigrated(); return sendJson(res, 200, { purchases: await records.listPurchases() }); }
    if (route === 'POST /api/purchases') {
      await records.createPurchase(await readBody(req));
      return sendJson(res, 201, { purchases: await records.listPurchases() });
    }
    const purchaseMatch = pathname.match(/^\/api\/purchases\/([0-9a-zA-Z-]{1,60})$/);
    if (purchaseMatch && req.method === 'DELETE') {
      await records.deletePurchase(purchaseMatch[1]);
      return sendJson(res, 200, { purchases: await records.listPurchases() });
    }
  }

  if (route === 'POST /api/password') {
    const body = await readBody(req);
    if (!(await security.verifyPassword(String(body.current || ''), user.passwordHash))) return fail(res, 400, 'A senha atual está incorreta.');
    if (typeof body.next !== 'string' || body.next.length < 8 || body.next.length > 200) return fail(res, 400, 'A nova senha precisa ter pelo menos 8 caracteres.');
    const passwordHash = await security.hashPassword(body.next);
    let updated;
    await updateUsers((users) => {
      updated = users.find((u) => u.id === user.id);
      updated.passwordHash = passwordHash;
      updated.sv = (updated.sv || 0) + 1; /* encerra as outras sessões */
    });
    /* quem trocou a senha continua logado */
    const token = await security.createToken(updated);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, token, security.SESSION_HOURS * 3600) });
  }

  /* Gestão de acessos: só o dono */
  if (pathname.startsWith('/api/users')) {
    if (user.role !== 'owner') return fail(res, 403, 'Apenas o dono pode gerenciar acessos.');

    if (route === 'GET /api/users') return sendJson(res, 200, { users: listUsers(await storage.loadUsers()) });

    if (route === 'POST /api/users') {
      const body = await readBody(req);
      if (!ROLES.includes(body.role)) return fail(res, 400, 'Perfil inválido.');
      const account = validateAccount(body, await storage.loadUsers());
      if (account.error) return fail(res, 400, account.error);
      await addUser(account, body.password, body.role);
      return sendJson(res, 201, { users: listUsers(await storage.loadUsers()) });
    }

    /* Trocar o perfil (cliente <-> mecânico <-> dono). A pessoa precisa entrar de novo para valer. */
    const roleMatch = pathname.match(/^\/api\/users\/([0-9a-f-]{36})\/role$/);
    if (roleMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      if (!ROLES.includes(body.role)) return fail(res, 400, 'Perfil inválido.');
      const problem = await updateUsers((users) => {
        const target = users.find((u) => u.id === roleMatch[1]);
        if (!target) return [404, 'Acesso não encontrado.'];
        if (target.id === user.id) return [400, 'Você não pode mudar o seu próprio perfil. Peça a outro dono.'];
        if (target.role === body.role) return null;
        if (target.role === 'owner' && users.filter((u) => u.role === 'owner').length < 2) return [400, 'É preciso manter ao menos um dono.'];
        target.role = body.role;
        target.sv = (target.sv || 0) + 1; /* encerra as sessões antigas: o novo perfil vale no próximo login */
        return null;
      });
      if (problem) return fail(res, problem[0], problem[1]);
      return sendJson(res, 200, { users: listUsers(await storage.loadUsers()) });
    }

    /* Redefinir a senha de alguém (não há recuperação por e-mail) */
    const resetMatch = pathname.match(/^\/api\/users\/([0-9a-f-]{36})\/password$/);
    if (resetMatch && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) return fail(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');
      const passwordHash = await security.hashPassword(body.password);
      const problem = await updateUsers((users) => {
        const target = users.find((u) => u.id === resetMatch[1]);
        if (!target) return [404, 'Acesso não encontrado.'];
        if (target.id === user.id) return [400, 'Para a sua própria senha, use "Alterar senha" no menu da conta.'];
        target.passwordHash = passwordHash;
        target.sv = (target.sv || 0) + 1;
        return null;
      });
      if (problem) return fail(res, problem[0], problem[1]);
      return sendJson(res, 200, { users: listUsers(await storage.loadUsers()) });
    }

    const match = pathname.match(/^\/api\/users\/([0-9a-f-]{36})$/);
    if (match && req.method === 'DELETE') {
      const problem = await updateUsers((users) => {
        const target = users.find((u) => u.id === match[1]);
        if (!target) return [404, 'Acesso não encontrado.'];
        if (target.id === user.id) return [400, 'Você não pode remover o seu próprio acesso.'];
        if (target.role === 'owner' && users.filter((u) => u.role === 'owner').length < 2) return [400, 'É preciso manter ao menos um dono.'];
        users.splice(users.indexOf(target), 1);
        return null;
      });
      if (problem) return fail(res, problem[0], problem[1]);
      return sendJson(res, 200, { users: listUsers(await storage.loadUsers()) });
    }
  }

  return fail(res, 404, 'Não encontrado.');
}

/* ---------- Arquivos estáticos (somente a pasta public/) ---------- */

async function serveStatic(req, res, url) {
  let pathname = url.pathname;
  const user = await currentUser(req);

  if (pathname === '/' || pathname === '/index.html') {
    if (!user) { res.writeHead(302, { Location: '/login.html' }); return res.end(); }
    pathname = '/index.html';
  }
  if (pathname === '/login.html' && user) { res.writeHead(302, { Location: '/' }); return res.end(); }

  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  const ext = path.extname(file);
  const hidden = path.relative(PUBLIC_DIR, file).split(path.sep).some((part) => part.startsWith('.'));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || hidden || !MIME[ext]) { res.writeHead(404); return res.end('Não encontrado'); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(data);
  });
}

/* ---------- Entrada ---------- */

async function handle(req, res) {
  securityHeaders(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    /* Na Vercel, vercel.json reescreve /api/* para a função e guarda o caminho original em __path */
    const pathname = url.searchParams.get('__path') || url.pathname;
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else if (ON_VERCEL) { res.writeHead(404); res.end('Não encontrado'); }
    else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    if (e.status === 413) {
      res.setHeader('Connection', 'close');
      res.on('finish', () => req.destroy());
    }
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erro interno.');
    if (!e.status) console.error(e);
  }
}

module.exports = { handle };
