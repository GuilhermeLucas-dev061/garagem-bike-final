/* Comparador de preços: onde comprar uma peça mais barato.

   Fontes (cada uma só é consultada se estiver configurada):
   - Mercado Livre (API oficial): variáveis ML_CLIENT_ID e ML_CLIENT_SECRET (app criado em developers.mercadolivre.com.br).
   - Google Shopping via SerpApi: variável SERPAPI_KEY (serpapi.com). Cobre Amazon, Magalu, lojas de bike etc.
   Sem nenhuma chave, a tela ainda mostra links de busca prontos nas principais lojas.

   Tudo roda no servidor: as chaves nunca chegam ao navegador. */

const TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map();

const enc = encodeURIComponent;

/* Só links https viram href: nada vindo de API externa entra na página sem esta checagem */
function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch (e) { return ''; }
}

function storeLinks(q) {
  const dashed = q.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return [
    { store: 'Mercado Livre', url: `https://lista.mercadolivre.com.br/${enc(dashed)}` },
    { store: 'Amazon', url: `https://www.amazon.com.br/s?k=${enc(q)}` },
    { store: 'Magazine Luiza', url: `https://www.magazineluiza.com.br/busca/${enc(q)}/` },
    { store: 'Shopee', url: `https://shopee.com.br/search?keyword=${enc(q)}` },
    { store: 'Google Shopping', url: `https://www.google.com/search?tbm=shop&q=${enc(q)}` }
  ];
}

async function getJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------- Mercado Livre ---------- */

let mlToken = null;
async function mercadoLivreToken() {
  if (mlToken && mlToken.expires > Date.now() + 60000) return mlToken.value;
  const data = await getJson('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.ML_CLIENT_ID, client_secret: process.env.ML_CLIENT_SECRET })
  });
  mlToken = { value: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return mlToken.value;
}

async function mercadoLivre(q) {
  const token = await mercadoLivreToken();
  const data = await getJson(`https://api.mercadolibre.com/sites/MLB/search?q=${enc(q)}&limit=20&sort=price_asc`, { headers: { Authorization: `Bearer ${token}` } });
  return (data.results || []).map((r) => ({
    title: String(r.title || ''), price: Number(r.price), store: 'Mercado Livre', seller: r.seller?.nickname || '',
    condition: r.condition === 'used' ? 'Usado' : r.condition === 'new' ? 'Novo' : '', freeShipping: Boolean(r.shipping?.free_shipping), url: safeUrl(r.permalink)
  }));
}

/* ---------- Google Shopping (SerpApi) ---------- */

async function googleShopping(q) {
  const data = await getJson(`https://serpapi.com/search.json?engine=google_shopping&q=${enc(q)}&gl=br&hl=pt-br&api_key=${enc(process.env.SERPAPI_KEY)}`);
  return (data.shopping_results || []).map((r) => ({
    title: String(r.title || ''), price: Number(r.extracted_price), store: String(r.source || 'Loja'), seller: '',
    condition: '', freeShipping: /gr[aá]tis/i.test(String(r.delivery || '')), url: safeUrl(r.product_link || r.link)
  }));
}

const PROVIDERS = [
  { name: 'Mercado Livre', enabled: () => Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET), run: mercadoLivre },
  { name: 'Google Shopping', enabled: () => Boolean(process.env.SERPAPI_KEY), run: googleShopping }
];

/* ---------- Busca ---------- */

async function searchPrices(rawQuery) {
  const q = String(rawQuery || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (q.length < 2) throw Object.assign(new Error('Digite o nome da peça (ao menos 2 letras).'), { status: 400 });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const active = PROVIDERS.filter((p) => p.enabled());
  const settled = await Promise.allSettled(active.map((p) => p.run(q)));
  const sources = active.map((p, i) => (settled[i].status === 'fulfilled' ? { name: p.name, ok: true } : { name: p.name, ok: false, error: String(settled[i].reason?.message || 'falhou').slice(0, 120) }));
  const offers = settled
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((o) => o.title && Number.isFinite(o.price) && o.price > 0 && o.url)
    .sort((a, b) => a.price - b.price)
    .slice(0, 30);

  const value = { query: q, offers, links: storeLinks(q), sources, configured: active.length > 0 };
  /* Não guarda resposta com falha: tenta de novo na próxima busca */
  if (sources.every((s) => s.ok)) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + CACHE_MS });
  }
  return value;
}

module.exports = { searchPrices };
