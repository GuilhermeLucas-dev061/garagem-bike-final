/* Persistência, sem banco de dados tradicional. Dois modos, escolhidos pelo ambiente:

   - arquivos JSON em data/ (padrão, para rodar no próprio computador ou em um servidor com disco);
   - Redis via API REST (Upstash), usado quando existem as variáveis de ambiente do Redis.
     É o modo da Vercel, onde as funções não têm disco gravável.

   A pasta data/ fica fora de public/, então nunca é servida ao navegador. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const remote = Boolean(REST_URL && REST_TOKEN);
const mode = remote ? 'redis' : 'file';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

/* Na Vercel o disco é somente leitura: sem Redis configurado, avisa com clareza em vez de falhar no meio */
function assertReady() {
  if (process.env.VERCEL && !remote) {
    throw Object.assign(new Error('Banco de dados não configurado. Conecte o Upstash Redis ao projeto na Vercel (veja o guia).'), { status: 500 });
  }
}

/* ---------- Redis (API REST do Upstash) ---------- */

async function redis(...command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis: ${data.error || res.status}`);
  return data.result;
}

/* ---------- Arquivos ---------- */

/* Grava em arquivo temporário e renomeia: uma queda no meio da escrita não corrompe os dados */
function writeJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`Aviso: não consegui ler ${path.basename(file)} (${e.message}). Usando valor inicial.`);
    return fallback;
  }
}

/* ---------- Dados ---------- */

async function loadDb(seed) {
  assertReady();
  if (remote) {
    const stored = await redis('GET', 'gb:db');
    if (stored) return JSON.parse(stored);
    const initial = seed();
    await redis('SET', 'gb:db', JSON.stringify(initial));
    return initial;
  }
  if (!fs.existsSync(DB_FILE)) writeJson(DB_FILE, seed());
  return readJson(DB_FILE, seed());
}

async function saveDb(db) {
  assertReady();
  if (remote) await redis('SET', 'gb:db', JSON.stringify(db));
  else writeJson(DB_FILE, db);
}

async function loadUsers() {
  assertReady();
  if (remote) {
    const stored = await redis('GET', 'gb:users');
    return stored ? JSON.parse(stored) : [];
  }
  return readJson(USERS_FILE, []);
}

async function saveUsers(users) {
  assertReady();
  if (remote) await redis('SET', 'gb:users', JSON.stringify(users));
  else writeJson(USERS_FILE, users);
}

/* ---------- Coleções (um registro por entrada) ----------
   Compras e pedidos da loja ficam aqui, e não no bloco único de dados da oficina: cada registro é
   gravado sozinho (HSET no Redis, um objeto por id em arquivo). Assim, dois acessos simultâneos
   (ex.: dois clientes comprando ao mesmo tempo) nunca sobrescrevem o registro um do outro. */

const COLLECTIONS = ['purchases', 'orders'];
const colFile = (name) => path.join(DATA_DIR, `${name}.json`);
const checkCol = (name) => { if (!COLLECTIONS.includes(name)) throw new Error(`Coleção desconhecida: ${name}`); };

async function colList(name) {
  checkCol(name); assertReady();
  if (remote) {
    const flat = (await redis('HGETALL', `gb:${name}`)) || [];
    const out = [];
    for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]));
    return out;
  }
  return Object.values(readJson(colFile(name), {}));
}

async function colGet(name, id) {
  checkCol(name); assertReady();
  if (remote) { const v = await redis('HGET', `gb:${name}`, id); return v ? JSON.parse(v) : null; }
  return readJson(colFile(name), {})[id] || null;
}

async function colPut(name, record) {
  checkCol(name); assertReady();
  if (remote) { await redis('HSET', `gb:${name}`, record.id, JSON.stringify(record)); return record; }
  const all = readJson(colFile(name), {});
  all[record.id] = record;
  writeJson(colFile(name), all);
  return record;
}

async function colDel(name, id) {
  checkCol(name); assertReady();
  if (remote) { await redis('HDEL', `gb:${name}`, id); return; }
  const all = readJson(colFile(name), {});
  delete all[id];
  writeJson(colFile(name), all);
}

/* Chave que assina as sessões. Na Vercel precisa vir da variável SESSION_SECRET; localmente é gerada uma vez. */
let cachedSecret = null;
async function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET) {
    if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres.');
    cachedSecret = process.env.SESSION_SECRET;
  } else if (remote) {
    throw Object.assign(new Error('Defina a variável SESSION_SECRET (veja o guia).'), { status: 500 });
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
    cachedSecret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }
  return cachedSecret;
}

/* ---------- Tentativas de login (precisam valer entre instâncias, por isso ficam no Redis quando ele existe) ---------- */

const localFails = new Map();

/* { count, ttl } — ttl em segundos até a janela de bloqueio acabar */
async function failState(key) {
  if (remote) {
    const count = Number(await redis('GET', `gb:fails:${key}`)) || 0;
    return { count, ttl: count ? Math.max(1, Number(await redis('TTL', `gb:fails:${key}`)) || 1) : 0 };
  }
  const entry = localFails.get(key);
  if (!entry || entry.expires < Date.now()) { localFails.delete(key); return { count: 0, ttl: 0 }; }
  return { count: entry.count, ttl: Math.ceil((entry.expires - Date.now()) / 1000) };
}

async function addFail(key, windowSeconds) {
  if (remote) {
    const count = await redis('INCR', `gb:fails:${key}`);
    if (count === 1) await redis('EXPIRE', `gb:fails:${key}`, windowSeconds);
    return;
  }
  const entry = localFails.get(key);
  if (!entry || entry.expires < Date.now()) localFails.set(key, { count: 1, expires: Date.now() + windowSeconds * 1000 });
  else entry.count += 1;
}

async function clearFails(key) {
  if (remote) await redis('DEL', `gb:fails:${key}`);
  else localFails.delete(key);
}

module.exports = { mode, DATA_DIR, loadDb, saveDb, loadUsers, saveUsers, colList, colGet, colPut, colDel, getSecret, failState, addFail, clearFails };
