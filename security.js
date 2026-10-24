/* Senhas, sessões e limite de tentativas. Só usa módulos nativos do Node.

   As sessões são tokens assinados (HMAC), sem estado no servidor: funcionam em qualquer instância
   (necessário na Vercel) e sobrevivem a reinício. Cada conta tem um contador "sv"; trocar a senha,
   remover o acesso ou sair incrementa o contador e invalida todas as sessões daquela conta. */

const crypto = require('crypto');
const { promisify } = require('util');
const storage = require('./storage');

const scrypt = promisify(crypto.scrypt);
const SESSION_HOURS = 8;
const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;

/* ---------- Senhas: scrypt com sal aleatório ("scrypt$sal$hash") ---------- */

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/* Gasta o mesmo tempo quando o e-mail não existe (evita descobrir contas pelo tempo de resposta) */
let dummyHash = null;
async function burnTime(password) {
  dummyHash = dummyHash || (await hashPassword('tempo-constante'));
  await verifyPassword(password, dummyHash);
}

/* ---------- Sessões assinadas ---------- */

const b64 = (value) => Buffer.from(value).toString('base64url');

async function sign(body) {
  const mac = crypto.createHmac('sha256', await storage.getSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

async function createToken(user) {
  const payload = { uid: user.id, sv: user.sv || 0, exp: Date.now() + SESSION_HOURS * 3600 * 1000 };
  return sign(b64(JSON.stringify(payload)));
}

/* Devolve o usuário dono do token, ou null se for inválido, expirado ou revogado */
async function userFromToken(token, users) {
  if (!token || typeof token !== 'string' || token.length > 600) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = (await sign(body)).split('.')[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!payload || payload.exp < Date.now()) return null;
  const user = users.find((u) => u.id === payload.uid);
  return user && (user.sv || 0) === payload.sv ? user : null;
}

/* ---------- Limite de tentativas de login ---------- */

/* Minutos restantes de bloqueio (0 = liberado) */
async function lockedMinutes(keys) {
  let seconds = 0;
  for (const key of keys) {
    const { count, ttl } = await storage.failState(key);
    if (count >= MAX_FAILS) seconds = Math.max(seconds, ttl);
  }
  return Math.ceil(seconds / 60);
}

const registerFail = (keys) => Promise.all(keys.map((key) => storage.addFail(key, LOCK_SECONDS)));
const clearFails = (keys) => Promise.all(keys.map((key) => storage.clearFails(key)));

module.exports = { hashPassword, verifyPassword, burnTime, createToken, userFromToken, lockedMinutes, registerFail, clearFails, SESSION_HOURS };
