/* Blocos de interface reutilizados pelas telas.
   Todo texto vindo dos dados passa por esc() antes de entrar em innerHTML. */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* '2026-10-15' -> '15/10/2026' (sem passar por Date, para não sofrer com fuso) */
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}

/* Ordem de serviço sem valor definido (ex.: pedido feito pelo cliente) */
const priceLabel = (price) => (Number(price) > 0 ? money(price) : 'A definir');

let uidCounter = 0;
const uid = (prefix = 'id') => `${prefix}-${++uidCounter}`;

/* ---------- Botões e links ---------- */

function dataAttrs(data = {}) {
  return Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
}

/* btn('Salvar', { variant: 'primary', icon: 'plus', action: 'open-modal', data: { type: 'sale' } })
   collapse: esconde o texto em telas estreitas (exige label acessível). */
function btn(label, { variant = 'secondary', size = '', icon: iconName = '', action = '', data = {}, type = 'button', disabled = false, ariaLabel = '', collapse = false } = {}) {
  const classes = ['btn', `btn-${variant}`, size && `btn-${size}`, collapse && 'btn-collapse'].filter(Boolean).join(' ');
  const aria = ariaLabel || (collapse ? label : '');
  return `<button type="${type}" class="${classes}"${action ? ` data-action="${action}"` : ''}${dataAttrs(data)}${aria ? ` aria-label="${esc(aria)}"` : ''}${disabled ? ' disabled' : ''}>${iconName ? icon(iconName) : ''}${label ? `<span class="btn-label">${esc(label)}</span>` : ''}</button>`;
}

function linkButton(label, { action = 'go', data = {}, arrow = true } = {}) {
  return `<button type="button" class="link" data-action="${action}"${dataAttrs(data)}>${esc(label)}${arrow ? icon('arrow-right', { size: 14 }) : ''}</button>`;
}

/* ---------- Estados ---------- */

const STATUS_TONE = {
  'Aguardando': 'neutral',
  'Em andamento': 'info',
  'Pronta': 'success',
  'Concluído': 'success',
  'Solicitado': 'warning',
  'Recebido': 'success',
  'Alta': 'warning',
  'Normal': 'neutral',
  'Baixa': 'neutral',
  'Baixo': 'warning',
  'Sem estoque': 'danger',
  'Disponível': 'success'
};

/* Ponto colorido + texto: o significado nunca depende só da cor */
function statusMark(label, tone) {
  return `<span class="status" data-tone="${tone || STATUS_TONE[label] || 'neutral'}">${esc(label)}</span>`;
}

/* Só destaca o que foge do normal */
function stockMark(product) {
  if (product.stock <= 0) return statusMark('Sem estoque', 'danger');
  if (isLowStock(product)) return statusMark('Baixo', 'warning');
  return '';
}

/* Etapas do serviço, usadas no acompanhamento do cliente */
function steps(status) {
  const order = ['Aguardando', 'Em andamento', 'Pronta'];
  const current = status === 'Concluído' ? 2 : Math.max(0, order.indexOf(status));
  const items = order.map((name, i) => {
    const label = i === 2 && status === 'Concluído' ? 'Concluído' : name;
    return `<li class="step${i <= current ? ' is-reached' : ''}"${i === current ? ' aria-current="step"' : ''}><span class="step-label">${label}</span></li>`;
  });
  return `<ol class="steps" aria-label="Andamento do serviço">${items.join('')}</ol>`;
}

function emptyState({ icon: iconName = 'inbox', title, text = '', action = '' }) {
  return `<div class="empty">${icon(iconName, { size: 20 })}<p class="empty-title">${esc(title)}</p>${text ? `<p class="empty-text">${esc(text)}</p>` : ''}${action}</div>`;
}

/* ---------- Estrutura de página ---------- */

const panel = (content, extraClass = '') => `<div class="panel${extraClass ? ` ${extraClass}` : ''}">${content}</div>`;

function section(title, content, { count = null, action = '' } = {}) {
  const badge = count === null ? '' : `<span class="section-count">${count}</span>`;
  return `<section class="section"><div class="section-head"><h2 class="section-title">${esc(title)}${badge}</h2>${action}</div>${content}</section>`;
}

/* Indicadores lado a lado, num único bloco: [{ label, value, note }] */
function figures(items, { extra = '' } = {}) {
  const cells = items.map((i) => `<div class="figure"><dt class="figure-label">${esc(i.label)}</dt><dd class="figure-value">${i.value}</dd>${i.note ? `<dd class="figure-note">${esc(i.note)}</dd>` : ''}</div>`);
  return `<div class="panel">${`<dl class="figures" data-count="${items.length}">${cells.join('')}</dl>`}${extra}</div>`;
}

/* Lista de linhas dentro de um painel; cada item já vem como <li class="row"> */
function rowList(items, emptyHtml = '') {
  return items.length ? panel(`<ul class="rows">${items.join('')}</ul>`) : panel(emptyHtml);
}

/* Tabela com cabeçalho acessível. Em telas estreitas cada linha vira um bloco
   (rótulos vêm de data-label); os roles preservam a semântica de tabela. */
function dataTable({ label, columns, rows, empty }) {
  if (!rows.length) return panel(empty);
  const head = columns.map((c) => `<th role="columnheader" scope="col"${c.align === 'right' ? ' class="num"' : ''}>${c.hideLabel ? `<span class="sr-only">${esc(c.label)}</span>` : esc(c.label)}</th>`).join('');
  const body = rows.map((row) => {
    const cells = columns.map((c) => {
      const attrs = [`role="cell"`, `data-label="${esc(c.label)}"`];
      const cls = [c.align === 'right' && 'num', c.nowrap && 'nowrap'].filter(Boolean).join(' ');
      if (cls) attrs.push(`class="${cls}"`);
      if (c.primary) attrs.push('data-primary');
      if (c.actions) attrs.push('data-actions');
      return `<td ${attrs.join(' ')}>${c.render(row)}</td>`;
    }).join('');
    return `<tr role="row">${cells}</tr>`;
  }).join('');
  return panel(`<div class="table-wrap" role="region" aria-label="${esc(label)}" tabindex="0"><table class="table" role="table"><thead role="rowgroup"><tr role="row">${head}</tr></thead><tbody role="rowgroup">${body}</tbody></table></div>`);
}

/* ---------- Busca e filtros ---------- */

function searchField({ label, placeholder }) {
  return `<div class="search"><label class="sr-only" for="search">${esc(label)}</label>${icon('search')}<input id="search" class="input" type="search" placeholder="${esc(placeholder)}" value="${esc(search)}" autocomplete="off" data-search></div>`;
}

function segmented({ label, group, options, current }) {
  const buttons = options.map((o) => `<button type="button" class="segmented-btn" data-action="set-filter" data-group="${group}" data-value="${esc(o.value)}" aria-pressed="${o.value === current}">${esc(o.label)}${o.count != null ? `<span class="segmented-count">${o.count}</span>` : ''}</button>`);
  return `<div class="segmented" role="group" aria-label="${esc(label)}">${buttons.join('')}</div>`;
}

function avatar(name, size = '') {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return `<span class="avatar${size ? ` avatar-${size}` : ''}" aria-hidden="true">${esc(initials)}</span>`;
}

/* ---------- Campos de formulário ---------- */

/* Tipos: texto (padrão), number, date, select, textarea.
   kind 'money' adiciona o prefixo R$; as regras (min/step/required) são as da versão anterior. */
function fieldHtml(f, scope) {
  const id = `${scope}-${f.name}`;
  const attrs = [`id="${id}"`, `name="${f.name}"`];
  if (!f.optional) attrs.push('required');
  if (f.hint) attrs.push(`aria-describedby="${id}-hint"`);
  if (f.autofocus) attrs.push('autofocus');
  if (f.autocomplete) attrs.push(`autocomplete="${f.autocomplete}"`);

  let control;
  if (f.type === 'select') {
    const options = (f.options || []).map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o;
      return `<option value="${esc(opt.value)}"${String(opt.value) === String(f.value) ? ' selected' : ''}>${esc(opt.label)}</option>`;
    });
    control = `<select class="select" ${attrs.join(' ')}>${options.join('')}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea class="textarea" ${attrs.join(' ')} rows="3" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
  } else {
    if (f.type === 'number') attrs.push(`min="${f.min ?? 0}"`, 'step="0.01"', 'inputmode="decimal"');
    if (f.type === 'date' && f.min) attrs.push(`min="${f.min}"`);
    const input = `<input class="input" type="${f.type || 'text'}" ${attrs.join(' ')} placeholder="${esc(f.placeholder || '')}" value="${esc(f.value ?? '')}"${(f.type === 'text' || !f.type) && !f.autocomplete ? ' autocomplete="off"' : ''}>`;
    control = f.kind === 'money' ? `<div class="input-affix"><span class="affix" aria-hidden="true">R$</span>${input}</div>` : input;
  }

  const optional = f.optional ? '<span class="optional">Opcional</span>' : '';
  const hint = f.hint ? `<p class="field-hint" id="${id}-hint">${esc(f.hint)}</p>` : '';
  return `<div class="field${f.full ? ' field-full' : ''}"><label class="label" for="${id}">${esc(f.label)}${optional}</label>${control}${hint}</div>`;
}

function validationMessage(el) {
  const v = el.validity;
  if (v.valueMissing) return 'Preencha este campo.';
  if (v.rangeUnderflow) {
    return el.type === 'date' ? `Escolha uma data a partir de ${fmtDate(el.min)}.` : `Informe um valor igual ou maior que ${el.min}.`;
  }
  if (v.rangeOverflow) return `Informe um valor igual ou menor que ${el.max}.`;
  if (v.badInput || v.typeMismatch || v.stepMismatch) return 'Informe um valor válido.';
  return el.validationMessage || 'Valor inválido.';
}

function setFieldError(el, message) {
  const wrap = el.closest('.field');
  if (!wrap) return;
  let error = wrap.querySelector('.field-error');
  const ids = new Set((el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));

  if (!message) {
    if (error) ids.delete(error.id);
    error?.remove();
    el.removeAttribute('aria-invalid');
  } else {
    if (!error) {
      error = document.createElement('p');
      error.className = 'field-error';
      error.id = `${el.id}-error`;
      wrap.append(error);
    }
    error.innerHTML = `${icon('circle-alert', { size: 14 })}<span>${esc(message)}</span>`;
    el.setAttribute('aria-invalid', 'true');
    ids.add(error.id);
  }
  if (ids.size) el.setAttribute('aria-describedby', [...ids].join(' '));
  else el.removeAttribute('aria-describedby');
}

/* Validação nativa (mesmas regras dos atributos), mas com o erro junto do campo */
function validateForm(form) {
  let firstInvalid = null;
  $$('input, select, textarea', form).forEach((el) => {
    const valid = el.checkValidity();
    setFieldError(el, valid ? '' : validationMessage(el));
    if (!valid && !firstInvalid) firstInvalid = el;
  });
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches?.('[aria-invalid="true"]') && el.checkValidity()) setFieldError(el, '');
});

/* ---------- Notificações ---------- */

let toastTimer = null;

function toast(message, tone = 'success') {
  const root = $('#toastroot');
  if (!root) return;
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tone = tone;
  el.innerHTML = `${icon(tone === 'error' ? 'circle-alert' : 'circle-check', { size: 18 })}<p class="toast-text">${esc(message)}</p><button type="button" class="icon-btn icon-btn-sm" data-action="dismiss-toast" aria-label="Fechar notificação">${icon('x')}</button>`;
  root.replaceChildren(el);
  toastTimer = setTimeout(() => root.replaceChildren(), tone === 'error' ? 7000 : 4000);
}

/* ---------- Indicadores, gráficos e cards ---------- */

/* Indicador com ícone; tone: brand | info | warning | danger */
function kpi({ label, value, note = '', icon: iconName, tone = 'brand' }) {
  return `<div class="kpi" data-tone="${tone}"><span class="kpi-icon">${icon(iconName, { size: 20 })}</span><div class="kpi-body"><p class="kpi-label">${esc(label)}</p><p class="kpi-value">${value}</p>${note ? `<p class="kpi-note">${esc(note)}</p>` : ''}</div></div>`;
}
const kpiGrid = (items) => `<div class="kpis">${items.map(kpi).join('')}</div>`;

/* Barras horizontais: [{ label, value, text, tone }] */
function barChart(items, emptyHtml = '') {
  if (!items.length) return emptyHtml;
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<ul class="bars">${items.map((i) => `<li class="bar"><div class="bar-head"><span>${esc(i.label)}</span><strong>${i.text}</strong></div><progress class="meter" data-tone="${i.tone || 'brand'}" value="${i.value}" max="${max}" aria-label="${esc(i.label)}"></progress></li>`).join('')}</ul>`;
}

/* Anel de progresso (SVG) */
function ring(pct, caption) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return `<div class="ring" role="img" aria-label="${Math.round(pct)}% ${esc(caption)}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="${r}"/><circle class="ring-value" cx="60" cy="60" r="${r}" stroke-dasharray="${(c * shown / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/></svg><div class="ring-text"><strong>${Math.round(pct)}%</strong><span>${esc(caption)}</span></div></div>`;
}

/* Painel com cabeçalho próprio */
function card(title, body, { action = '', sub = '' } = {}) {
  return `<section class="panel card"><div class="card-head"><div><h2 class="card-title">${esc(title)}</h2>${sub ? `<p class="row-meta">${esc(sub)}</p>` : ''}</div>${action}</div><div class="card-body">${body}</div></section>`;
}

const chip = (text) => `<span class="chip">${esc(text)}</span>`;

/* Nível de estoque: barra colorida pelo estado */
function stockLevel(product, max = 15) {
  const tone = product.stock <= 0 ? 'danger' : isLowStock(product) ? 'warning' : 'brand';
  return `<progress class="meter" data-tone="${tone}" value="${Math.max(0, product.stock)}" max="${max}" aria-label="Nível de estoque de ${esc(product.name)}"></progress>`;
}

/* Sem foto cadastrada: peça com cor própria por categoria e inicial como marca */
function productArt(product) {
  const tint = [...String(product.category)].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 5;
  return `<div class="product-art" data-tint="${tint}" aria-hidden="true"><span>${esc(String(product.category).charAt(0).toUpperCase())}</span></div>`;
}
