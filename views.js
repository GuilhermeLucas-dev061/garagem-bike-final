/* Telas. Cada função devolve { html, actions, results? }:
   - html: conteúdo da página
   - actions: botões do cabeçalho
   - results: quando a tela tem busca/filtro, redesenha só a área #results
     (assim o campo de busca mantém o foco enquanto se digita). */

const SERVICES = [
  { type: 'Manutenção', icon: 'wrench', title: 'Manutenção', text: 'Diagnóstico e reparos para sua bike voltar à estrada.' },
  { type: 'Revisão', icon: 'clipboard-check', title: 'Revisão completa', text: 'Checagem de freios, transmissão, rodas e segurança.' },
  { type: 'Ajuste', icon: 'sliders-horizontal', title: 'Ajustes rápidos', text: 'Regulagens, troca de peças e pequenos reparos.' }
];

const TIPS = [
  { icon: 'gauge', title: 'Calibragem', text: 'Confira a pressão indicada no pneu antes de pedalar.' },
  { icon: 'sparkles', title: 'Limpeza', text: 'Mantenha a transmissão limpa e lubrificada com produto adequado.' },
  { icon: 'shield-check', title: 'Freios', text: 'Se notar ruídos ou perda de eficiência, procure uma revisão.' }
];

const HOW_IT_WORKS = [
  { title: 'Agende', text: 'Escolha o serviço, a data e o profissional.' },
  { title: 'Acompanhe', text: 'Veja cada etapa do conserto em tempo real.' },
  { title: 'Retire', text: 'Quando estiver pronta, é só buscar sua bike.' }
];

/* ---------- Peças de composição ---------- */

const newAction = (label, type, variant = 'primary') =>
  btn(label, { variant, icon: 'plus', action: 'open-modal', data: { type }, collapse: true });

const intro = (text) => `<p class="intro">${esc(text)}</p>`;
const caption = (text) => `<p class="caption">${text}</p>`;
const results = (render) => `<div id="results">${render()}</div>`;
const noResults = () => emptyState({ icon: 'search', title: 'Nenhum resultado', text: 'Tente buscar por outro termo.' });
const matches = (text, query) => text.toLowerCase().includes(query.trim().toLowerCase());

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const today = () => {
  const text = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/* Faixa de abertura de cada painel */
function hero({ kicker, title, text, actions = '' }) {
  return `<section class="hero"><div class="hero-body"><p class="hero-kicker">${esc(kicker)}</p><h2 class="hero-title">${esc(title)}</h2><p class="hero-text">${esc(text)}</p>${actions ? `<div class="hero-actions">${actions}</div>` : ''}</div><div class="hero-art" aria-hidden="true">${icon('bike', { size: 168 })}</div></section>`;
}

function orderRow(job) {
  return `<li class="row">
    <div class="row-main"><p class="row-title">${esc(job.bike)}</p><p class="row-meta">${esc(job.service)} · ${esc(job.customer)}</p></div>
    <div class="row-side">${statusMark(job.status)}<p class="row-meta">${esc(job.mechanic)} · ${priceLabel(job.price)}</p></div>
    ${btn('Atualizar', { variant: 'ghost', size: 'sm', icon: 'pencil', action: 'edit-job', data: { id: job.id }, ariaLabel: `Atualizar serviço: ${job.bike}` })}
  </li>`;
}

const orderRows = (list, emptyTitle) => rowList(list.map(orderRow), emptyState({ icon: 'clipboard-list', title: emptyTitle }));

function ordersTable(list, label, empty) {
  return dataTable({
    label,
    rows: list,
    empty,
    columns: [
      { label: 'Bicicleta', primary: true, render: (j) => `<span class="cell-main">${esc(j.bike)}</span><span class="cell-sub">${esc(j.customer)}</span>` },
      { label: 'Serviço', render: (j) => `${esc(j.service)}<span class="cell-sub">${esc(j.type)}</span>` },
      { label: 'Responsável', render: (j) => esc(j.mechanic) },
      { label: 'Data', nowrap: true, render: (j) => fmtDate(j.date) },
      { label: 'Status', render: (j) => statusMark(j.status) },
      { label: 'Valor', align: 'right', render: (j) => priceLabel(j.price) },
      { label: 'Ações', hideLabel: true, actions: true, render: (j) => btn('Atualizar', { variant: 'ghost', size: 'sm', icon: 'pencil', action: 'edit-job', data: { id: j.id }, ariaLabel: `Atualizar serviço: ${j.bike}` }) }
    ]
  });
}

function availability(product) {
  if (product.stock <= 0) return statusMark('Indisponível', 'danger');
  if (isLowStock(product)) return statusMark(`Últimas ${plural(product.stock, 'unidade', 'unidades')}`, 'warning');
  return `${product.stock} em estoque`;
}

function buyButton(product, variant = 'secondary') {
  return btn('Comprar', { variant, size: 'sm', icon: 'shopping-bag', action: 'buy-product', data: { id: product.id }, ariaLabel: `Comprar ${product.name}`, disabled: product.stock < 1 });
}

function productCard(product, level = 3) {
  return `<article class="product">
    ${productArt(product)}
    <div class="product-body">
      ${chip(product.category)}
      <h${level} class="product-name">${esc(product.name)}</h${level}>
      <p class="product-stock">${availability(product)}</p>
      ${stockLevel(product)}
      <div class="product-foot"><p class="product-price">${money(product.price)}</p>${buyButton(product, 'primary')}</div>
    </div>
  </article>`;
}

const stockRow = (p) => `<li class="row">
    <div class="row-main"><p class="row-title">${esc(p.name)}</p><p class="row-meta">${esc(p.category)} · ${p.stock} em estoque</p>${stockLevel(p)}</div>
    <div class="row-side">${stockMark(p)}</div>
  </li>`;

const requestRow = (r, withAction = false) => `<li class="row">
    <div class="row-main"><p class="row-title">${esc(r.item)}</p><p class="row-meta">${r.qty} un. · Prioridade ${esc(String(r.priority).toLowerCase())}</p></div>
    <div class="row-side">${statusMark(r.status)}</div>
    ${withAction && isPendingRequest(r) ? btn('Recebido', { variant: 'ghost', size: 'sm', icon: 'check', action: 'complete-request', data: { id: r.id }, ariaLabel: `Marcar pedido como recebido: ${r.item}` }) : ''}
  </li>`;

/* Receita por produto vendido, do maior para o menor */
function salesByItem() {
  const totals = {};
  db.sales.forEach((s) => { totals[s.item] = (totals[s.item] || 0) + s.price * s.qty; });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, text: money(value) }));
}

/* ---------- Painéis iniciais ---------- */

function ownerDashboard() {
  const revenue = totalRevenue();
  const cost = totalCost();
  const profit = revenue - cost;
  const pct = Math.min(100, (revenue / Math.max(1, db.goal)) * 100);
  const open = db.jobs.filter(isOpen);
  const ready = db.jobs.filter(isReady);
  const low = db.products.filter(isLowStock);
  const pending = db.requests.filter(isPendingRequest);

  const openOrders = orders.filter((o) => o.status === 'Solicitado' || o.status === 'Pronto para retirada');
  const summary = [plural(openOrders.length, 'pedido da loja', 'pedidos da loja'), plural(open.length, 'serviço em aberto', 'serviços em aberto'), plural(low.length, 'peça com estoque baixo', 'peças com estoque baixo'), plural(pending.length, 'pedido pendente', 'pedidos pendentes')].join(' · ');
  const top = hero({
    kicker: today(),
    title: `${greeting()}! Veja como está a oficina.`,
    text: summary,
    actions: btn('Registrar venda', { variant: 'primary', icon: 'plus', action: 'open-modal', data: { type: 'sale' } }) + btn('Nova ordem', { icon: 'clipboard-list', action: 'open-modal', data: { type: 'job' } })
  });

  const kpis = kpiGrid([
    { label: 'Faturamento', value: money(revenue), note: plural(db.sales.length, 'venda registrada', 'vendas registradas'), icon: 'trending-up', tone: 'brand' },
    { label: 'Lucro bruto', value: money(profit), note: revenue > 0 ? `${Math.round((profit / revenue) * 100)}% de margem` : 'Sem vendas ainda', icon: 'circle-dollar-sign', tone: 'info' },
    { label: 'Serviços em aberto', value: String(open.length), note: `${plural(ready.length, 'pronta', 'prontas')} para retirada`, icon: 'wrench', tone: 'warning' },
    { label: 'Estoque baixo', value: String(low.length), note: low.length ? 'Reponha antes que faltem' : 'Tudo em dia', icon: 'package', tone: low.length ? 'danger' : 'brand' }
  ]);

  const goal = card('Meta mensal', `<div class="goal-ring">${ring(pct, 'da meta')}<div><p class="figure-value">${money(revenue)}</p><p class="row-meta">de ${money(db.goal)}</p>${linkButton('Editar meta', { data: { page: 'goals' } })}</div></div>`);
  const result = card('Resultado das vendas', barChart([
    { label: 'Faturamento', value: revenue, text: money(revenue) },
    { label: 'Custo das peças', value: cost, text: money(cost), tone: 'warning' },
    { label: 'Lucro bruto', value: Math.max(0, profit), text: money(profit), tone: 'info' }
  ]));
  const byItem = card('Vendas por produto', barChart(salesByItem().slice(0, 4), emptyState({ icon: 'receipt', title: 'Sem vendas ainda' })));

  const services = section('Serviços em aberto', orderRows(open, 'Nenhum serviço em aberto'), { count: open.length, action: linkButton('Ver todos', { data: { page: 'team' } }) });
  const readySection = ready.length ? section('Prontas para retirada', orderRows(ready), { count: ready.length }) : '';
  const stock = section('Estoque baixo', rowList(low.map(stockRow), emptyState({ icon: 'package', title: 'Estoque em dia', text: 'Nenhuma peça abaixo do mínimo.' })), { count: low.length, action: linkButton('Ver estoque', { data: { page: 'inventory' } }) });
  const requests = section('Pedidos de peças', rowList(pending.map((r) => requestRow(r)), emptyState({ icon: 'package-plus', title: 'Nenhum pedido pendente' })), { count: pending.length, action: linkButton('Ver pedidos', { data: { page: 'requests' } }) });

  return {
    actions: newAction('Registrar venda', 'sale'),
    html: `<div class="stack">${top}${kpis}<div class="trio">${goal}${result}${byItem}</div><div class="dash-grid"><div class="stack">${services}${readySection}</div><div class="stack">${stock}${requests}</div></div></div>`
  };
}

function boardCard(job) {
  return `<li class="k-card">
    <div class="k-top">${chip(job.type)}<span class="k-price">${priceLabel(job.price)}</span></div>
    <p class="row-title">${esc(job.bike)}</p>
    <p class="row-meta">${esc(job.service)}</p>
    <p class="row-meta">Cliente: ${esc(job.customer)} · ${fmtDate(job.date)}</p>
    <div class="k-foot"><span class="k-person">${avatar(job.mechanic)}${esc(job.mechanic)}</span>${btn('Atualizar', { variant: 'ghost', size: 'sm', icon: 'pencil', action: 'edit-job', data: { id: job.id }, ariaLabel: `Atualizar serviço: ${job.bike}` })}</div>
  </li>`;
}

function boardColumn(title, tone, list) {
  return `<section class="k-col"><h2 class="k-head"><span class="status" data-tone="${tone}">${esc(title)}</span><span class="section-count">${list.length}</span></h2>${list.length ? `<ul class="k-list">${list.map(boardCard).join('')}</ul>` : `<p class="k-empty">Nenhuma ordem aqui</p>`}</section>`;
}

function mechanicDashboard() {
  const inProgress = db.jobs.filter((j) => j.status === 'Em andamento');
  const waiting = db.jobs.filter((j) => j.status === 'Aguardando');
  const ready = db.jobs.filter(isReady);
  const pending = db.requests.filter(isPendingRequest);

  const top = hero({
    kicker: today(),
    title: `${greeting()}! Vamos deixar tudo rodando.`,
    text: `${plural(inProgress.length + waiting.length, 'serviço na fila', 'serviços na fila')} · ${plural(ready.length, 'bike pronta', 'bikes prontas')} para retirada`
  });
  const kpis = kpiGrid([
    { label: 'Aguardando', value: String(waiting.length), note: 'Ainda não iniciados', icon: 'clock', tone: 'warning' },
    { label: 'Em andamento', value: String(inProgress.length), note: 'Na bancada agora', icon: 'wrench', tone: 'info' },
    { label: 'Prontas', value: String(ready.length), note: 'Aguardando retirada', icon: 'circle-check', tone: 'brand' },
    { label: 'Pedidos de peças', value: String(pending.length), note: 'Aguardando recebimento', icon: 'package-plus', tone: 'danger' }
  ]);
  const board = `<div class="board">${boardColumn('Aguardando', 'neutral', waiting)}${boardColumn('Em andamento', 'info', inProgress)}${boardColumn('Pronta', 'success', ready)}</div>`;

  const requests = card('Pedidos de peças', rowList(db.requests.map((r) => requestRow(r, true)), emptyState({ icon: 'package-plus', title: 'Nenhum pedido de peça' })), { action: btn('Novo pedido', { variant: 'ghost', size: 'sm', icon: 'plus', action: 'open-modal', data: { type: 'request' } }) });
  const stock = card('Estoque', rowList(db.products.map(stockRow), emptyState({ icon: 'package', title: 'Nenhuma peça cadastrada' })), { action: linkButton('Pedir peças', { data: { page: 'requests' } }) });

  return {
    actions: newAction('Nova ordem', 'job'),
    html: `<div class="stack">${top}${kpis}${board}<div class="duo">${requests}${stock}</div></div>`
  };
}

function customerDashboard() {
  const top = `<section class="hero hero-lg"><div class="hero-body"><p class="hero-kicker">Garagem Bike</p><h2 class="hero-title">Sua bike em boas mãos.</h2><p class="hero-text">Manutenção, revisão e peças sem complicação. Agende um horário, acompanhe cada etapa e retire quando estiver pronta.</p><div class="hero-actions">${btn('Agendar serviço', { variant: 'primary', icon: 'calendar-plus', action: 'go', data: { page: 'booking' } })}${btn('Acompanhar minha bike', { icon: 'bike', action: 'go', data: { page: 'tracking' } })}</div></div><div class="hero-art" aria-hidden="true">${icon('bike', { size: 220 })}</div></section>`;

  const steps = `<ol class="how">${HOW_IT_WORKS.map((s, i) => `<li class="how-step"><span class="how-num">${i + 1}</span><div><p class="row-title">${esc(s.title)}</p><p class="row-meta">${esc(s.text)}</p></div></li>`).join('')}</ol>`;

  const services = section('Serviços da oficina', `<div class="services">${SERVICES.map((s) => `<article class="service panel">
      <span class="service-icon">${icon(s.icon, { size: 22 })}</span>
      <h3 class="service-title">${esc(s.title)}</h3>
      <p class="row-meta">${esc(s.text)}</p>
      ${btn('Agendar', { action: 'booking-type', data: { type: s.type }, ariaLabel: `Agendar ${s.title}` })}
    </article>`).join('')}</div>`);

  const popular = section('Mais procurados', `<div class="products">${db.products.slice(0, 3).map(productCard).join('')}</div>`, { action: linkButton('Ver loja', { data: { page: 'store' } }) });

  return { html: `<div class="stack">${top}${section('Como funciona', steps)}${services}${popular}</div>` };
}

/* ---------- Estoque, loja e finanças ---------- */

function inventoryPage() {
  const render = () => {
    const list = db.products.filter((p) => matches(`${p.name} ${p.category}`, search));
    return dataTable({
      label: 'Peças cadastradas',
      rows: list,
      empty: search ? noResults() : emptyState({ icon: 'package', title: 'Nenhuma peça cadastrada', text: 'Cadastre a primeira peça para controlar o estoque.' }),
      columns: [
        { label: 'Produto', primary: true, render: (p) => `<span class="cell-main">${esc(p.name)}</span><span class="cell-sub">${esc(p.category)}</span>` },
        ...(role === 'owner' ? [{ label: 'Custo', align: 'right', render: (p) => money(p.cost) }] : []),
        { label: 'Preço de venda', align: 'right', render: (p) => `<span class="cell-main">${money(p.price)}</span>` },
        ...(role === 'owner' ? [{ label: 'Margem', align: 'right', render: (p) => (p.price > 0 ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%` : '—') }] : []),
        { label: 'Estoque', render: (p) => `<span class="stock-cell">${stockLevel(p)}<span class="stock-qty">${p.stock}</span>${stockMark(p)}</span>` },
        { label: 'Ações', hideLabel: true, actions: true, render: (p) => btn('Ajustar', { variant: 'ghost', size: 'sm', icon: 'pencil', action: 'adjust-stock', data: { id: p.id }, ariaLabel: `Ajustar estoque: ${p.name}` }) + btn('Preços', { variant: 'ghost', size: 'sm', icon: 'tag', action: 'price-search', data: { q: p.name }, ariaLabel: `Comparar preços: ${p.name}` }) }
      ]
    });
  };
  const kpis = kpiGrid([
    { label: 'Peças cadastradas', value: String(db.products.length), icon: 'package', tone: 'brand' },
    { label: 'Estoque baixo', value: String(db.products.filter(isLowStock).length), note: `Limite de ${LOW_STOCK_LIMIT} unidades`, icon: 'triangle-alert', tone: 'warning' },
    ...(role === 'owner' ? [{ label: 'Valor em estoque', value: money(db.products.reduce((s, p) => s + p.cost * p.stock, 0)), note: 'A preço de custo', icon: 'layers', tone: 'info' }] : [])
  ]);
  return {
    actions: role === 'owner' ? newAction('Cadastrar peça', 'product') : '',
    results: render,
    html: `<div class="stack">${kpis}<div><div class="toolbar">${searchField({ label: 'Buscar peça ou categoria', placeholder: 'Buscar peça ou categoria' })}<div class="toolbar-end">${btn('Pedir peças', { icon: 'package-plus', action: 'go', data: { page: 'requests' } })}</div></div>${results(render)}</div></div>`
  };
}

function storePage() {
  const render = () => {
    const list = db.products.filter((p) => matches(`${p.name} ${p.category}`, search));
    if (!list.length) return panel(search ? noResults() : emptyState({ icon: 'package', title: 'Nenhuma peça disponível' }));
    return `<div class="products">${list.map((p) => productCard(p, 2)).join('')}</div>`;
  };
  return {
    results: render,
    html: `<div class="toolbar">${searchField({ label: 'Buscar peças', placeholder: 'Buscar pneus, aros, câmaras…' })}</div>${results(render)}`
  };
}

function salesPage() {
  const revenue = totalRevenue();
  const cost = totalCost();
  const summary = kpiGrid([
    { label: 'Faturamento', value: money(revenue), note: 'Vendas registradas', icon: 'trending-up', tone: 'brand' },
    { label: 'Custo dos itens', value: money(cost), note: 'Despesa associada às peças', icon: 'package', tone: 'warning' },
    { label: 'Lucro bruto', value: money(revenue - cost), note: revenue > 0 ? `${Math.round(((revenue - cost) / revenue) * 100)}% de margem` : 'Faturamento menos custo', icon: 'circle-dollar-sign', tone: 'info' },
    { label: 'Vendas', value: String(db.sales.length), note: 'Lançamentos no sistema', icon: 'receipt', tone: 'brand' }
  ]);
  const history = dataTable({
    label: 'Histórico de vendas',
    rows: db.sales,
    empty: emptyState({ icon: 'receipt', title: 'Nenhuma venda registrada', text: 'As vendas registradas aparecem aqui com custo e margem.' }),
    columns: [
      { label: 'Data', nowrap: true, render: (s) => fmtDate(s.date) },
      { label: 'Item vendido', primary: true, render: (s) => `<span class="cell-main">${esc(s.item)}</span><span class="cell-sub">${esc(s.customer)}</span>` },
      { label: 'Qtd.', align: 'right', render: (s) => s.qty },
      { label: 'Venda unitária', align: 'right', render: (s) => money(s.price) },
      { label: 'Custo unitário', align: 'right', render: (s) => money(s.cost) },
      { label: 'Lucro bruto', align: 'right', render: (s) => `<span class="cell-main">${money((s.price - s.cost) * s.qty)}</span>` }
    ]
  });
  const chart = section('Vendas por produto', panel(`<div class="panel-pad">${barChart(salesByItem(), emptyState({ icon: 'receipt', title: 'Sem vendas ainda' }))}</div>`));
  return {
    actions: newAction('Registrar venda', 'sale'),
    html: `<div class="stack">${summary}<div class="dash-grid">${section('Histórico de vendas', history)}${chart}</div></div>`
  };
}

function ledgerPage({ list, noun, nouns, total, icon: iconName, title, empty, columns, action }) {
  const biggest = list.reduce((m, x) => Math.max(m, x.price), 0);
  const kpis = kpiGrid([
    { label: `Total em ${nouns}`, value: money(total), icon: iconName, tone: 'brand' },
    { label: 'Registros', value: String(list.length), note: plural(list.length, noun, nouns), icon: 'receipt', tone: 'info' },
    { label: 'Maior lançamento', value: money(biggest), icon: 'trending-up', tone: 'warning' }
  ]);
  return { actions: action, html: `<div class="stack">${kpis}${dataTable({ label: title, rows: list, empty, columns })}</div>` };
}

function purchasesPage() {
  return ledgerPage({
    list: purchases, noun: 'compra', nouns: 'compras', total: purchases.reduce((sum, p) => sum + p.price, 0), icon: 'shopping-cart', title: 'Histórico de compras',
    action: btn('Pesquisar preços', { icon: 'tag', action: 'go', data: { page: 'prices' } }) + newAction('Registrar compra', 'purchase'),
    empty: emptyState({ icon: 'shopping-cart', title: 'Nenhuma compra registrada', text: 'Registre peças, fornecedores e valores pagos.' }),
    columns: [
      { label: 'Data', nowrap: true, render: (p) => fmtDate(p.date) },
      { label: 'Item comprado', primary: true, render: (p) => `<span class="cell-main">${esc(p.item)}</span>${p.productId ? '<span class="cell-sub">Entrou no estoque</span>' : ''}` },
      { label: 'Qtd.', align: 'right', render: (p) => p.qty },
      { label: 'Fornecedor', render: (p) => esc(p.supplier) },
      { label: 'Valor', align: 'right', render: (p) => `<span class="cell-main">${money(p.price)}</span>` },
      { label: 'Ações', hideLabel: true, actions: true, render: (p) => btn('Excluir', { variant: 'ghost', size: 'sm', icon: 'trash-2', action: 'delete-purchase', data: { id: p.id }, ariaLabel: `Excluir compra: ${p.item}` }) }
    ]
  });
}

function expensesPage() {
  return ledgerPage({
    list: db.expenses, noun: 'despesa', nouns: 'despesas', total: db.expenses.reduce((s, e) => s + e.price, 0), icon: 'wallet', title: 'Despesas cadastradas',
    action: newAction('Nova despesa', 'expense'),
    empty: emptyState({ icon: 'wallet', title: 'Nenhuma despesa cadastrada', text: 'Registre contas e gastos que não são ligados diretamente às peças.' }),
    columns: [
      { label: 'Data', nowrap: true, render: (e) => fmtDate(e.date) },
      { label: 'Descrição', primary: true, render: (e) => `<span class="cell-main">${esc(e.item)}</span>` },
      { label: 'Categoria', render: (e) => chip(e.category) },
      { label: 'Valor', align: 'right', render: (e) => `<span class="cell-main">${money(e.price)}</span>` }
    ]
  });
}

function goalsPage() {
  const revenue = totalRevenue();
  const ratio = (revenue / Math.max(1, db.goal)) * 100;
  const remaining = db.goal - revenue;
  const progress = `<div class="panel panel-pad goal-card">
    <div class="goal-ring goal-ring-lg">${ring(Math.min(100, ratio), 'da meta')}
      <div><p class="figure-label">Faturamento acumulado</p><p class="figure-value">${money(revenue)}</p><p class="row-meta">${remaining > 0 ? `Faltam ${money(remaining)}` : 'Meta atingida'} · meta de ${money(db.goal)}</p></div>
    </div>
  </div>`;
  const form = `<form class="panel panel-pad form-stack" data-form="goal" novalidate>
    ${fieldHtml({ name: 'goal', label: 'Nova meta de faturamento', type: 'number', kind: 'money', min: 1, value: db.goal, hint: 'Altere quando quiser acompanhar um novo objetivo.' }, 'goal')}
    <div class="form-actions">${btn('Salvar meta', { variant: 'primary', type: 'submit' })}</div>
  </form>`;
  return { html: `<div class="split">${progress}${form}</div>` };
}

/* ---------- Oficina ---------- */

const JOB_FILTERS = [
  { value: 'all', label: 'Todas', test: () => true },
  { value: 'Aguardando', label: 'Aguardando', test: (j) => j.status === 'Aguardando' },
  { value: 'Em andamento', label: 'Em andamento', test: (j) => j.status === 'Em andamento' },
  { value: 'ready', label: 'Prontas', test: isReady }
];

function jobsPage(readyOnly = false) {
  if (readyOnly) {
    const list = db.jobs.filter(isReady);
    return {
      actions: newAction('Nova ordem', 'job'),
      html: `<div class="stack">${kpiGrid([{ label: 'Prontas para retirada', value: String(list.length), note: 'Avise o cliente', icon: 'circle-check', tone: 'brand' }])}${ordersTable(list, 'Bikes prontas', emptyState({ icon: 'circle-check', title: 'Nenhuma bike pronta', text: 'As bicicletas finalizadas aparecem aqui para retirada.' }))}</div>`
    };
  }
  const render = () => {
    const filter = JOB_FILTERS.find((f) => f.value === filters.jobs) || JOB_FILTERS[0];
    const list = db.jobs.filter((j) => filter.test(j) && matches(`${j.bike} ${j.customer} ${j.service} ${j.mechanic}`, search));
    return ordersTable(list, 'Ordens de serviço', search || filter.value !== 'all'
      ? noResults()
      : emptyState({ icon: 'clipboard-list', title: 'Nenhuma ordem registrada', text: 'Crie uma ordem para acompanhar cada bicicleta.' }));
  };
  const options = JOB_FILTERS.map((f) => ({ value: f.value, label: f.label, count: db.jobs.filter(f.test).length }));
  const kpis = kpiGrid([
    { label: 'Aguardando', value: String(db.jobs.filter(JOB_FILTERS[1].test).length), icon: 'clock', tone: 'warning' },
    { label: 'Em andamento', value: String(db.jobs.filter(JOB_FILTERS[2].test).length), icon: 'wrench', tone: 'info' },
    { label: 'Prontas', value: String(db.jobs.filter(isReady).length), icon: 'circle-check', tone: 'brand' }
  ]);
  return {
    actions: newAction('Nova ordem', 'job'),
    results: render,
    html: `<div class="stack">${kpis}<div><div class="toolbar">${searchField({ label: 'Buscar ordem de serviço', placeholder: 'Buscar por bicicleta, cliente ou serviço' })}<div class="toolbar-end">${segmented({ label: 'Filtrar por status', group: 'jobs', options, current: filters.jobs })}</div></div>${results(render)}</div></div>`
  };
}

function teamPage() {
  const names = [...new Set([...mechanicNames(), ...db.jobs.map((j) => j.mechanic)])].filter((n) => n !== 'A definir');
  const people = names.map((name) => {
    const own = db.jobs.filter((j) => j.mechanic === name);
    const done = own.filter(isReady).length;
    return `<article class="panel panel-pad member">
      <div class="member-head">${avatar(name, 'lg')}<div><h3 class="person-name">${esc(name)}</h3><p class="row-meta">${plural(own.length, 'ordem', 'ordens')} no total</p></div></div>
      <progress class="meter" value="${done}" max="${own.length || 1}" aria-label="Ordens prontas de ${esc(name)}"></progress>
      <p class="row-meta">${own.filter(isOpen).length} em aberto · ${plural(done, 'pronta', 'prontas')}</p>
    </article>`;
  }).join('');
  return {
    actions: newAction('Atribuir serviço', 'job'),
    html: `<div class="stack">${names.length ? section('Carga por profissional', `<div class="people">${people}</div>`) : ''}${section('Ordens de serviço', ordersTable(db.jobs, 'Ordens de serviço', emptyState({ icon: 'clipboard-list', title: 'Nenhuma ordem registrada' })))}</div>`
  };
}

function requestsPage() {
  const pending = db.requests.filter(isPendingRequest);
  const kpis = kpiGrid([
    { label: 'Pendentes', value: String(pending.length), note: 'Aguardando recebimento', icon: 'clock', tone: 'warning' },
    { label: 'Recebidos', value: String(db.requests.length - pending.length), icon: 'circle-check', tone: 'brand' },
    { label: 'Prioridade alta', value: String(pending.filter((r) => r.priority === 'Alta').length), note: 'Entre os pendentes', icon: 'triangle-alert', tone: 'danger' }
  ]);
  const table = dataTable({
    label: 'Solicitações de compra',
    rows: db.requests,
    empty: emptyState({ icon: 'package-plus', title: 'Nenhum pedido de peça', text: 'Avise o dono sobre o que precisa ser comprado.' }),
    columns: [
      { label: 'Peça', primary: true, render: (r) => `<span class="cell-main">${esc(r.item)}</span>` },
      { label: 'Quantidade', align: 'right', render: (r) => r.qty },
      { label: 'Prioridade', render: (r) => statusMark(r.priority) },
      { label: 'Data', nowrap: true, render: (r) => fmtDate(r.date) },
      { label: 'Status', render: (r) => statusMark(r.status) },
      { label: 'Ações', hideLabel: true, actions: true, render: (r) => btn('Preços', { variant: 'ghost', size: 'sm', icon: 'tag', action: 'price-search', data: { q: r.item }, ariaLabel: `Comparar preços: ${r.item}` }) + (isPendingRequest(r) ? btn('Recebido', { variant: 'ghost', size: 'sm', icon: 'check', action: 'complete-request', data: { id: r.id }, ariaLabel: `Marcar pedido como recebido: ${r.item}` }) : '') }
    ]
  });
  return { actions: newAction('Pedir peça', 'request'), html: `<div class="stack">${kpis}${table}</div>` };
}

/* ---------- Cliente ---------- */

function bookingPage() {
  const f = (spec) => fieldHtml(spec, 'booking');
  const form = `<form class="panel form-sections" data-form="booking" novalidate>
    <fieldset class="form-section">
      <legend>Seus dados</legend>
      <div class="form-grid">
        ${f({ name: 'customer', label: 'Seu nome', placeholder: 'Como podemos te chamar?', value: currentUser.name })}
        ${f({ name: 'contact', label: 'Contato (telefone ou e-mail)', placeholder: '(00) 00000-0000', value: currentUser.email })}
      </div>
    </fieldset>
    <fieldset class="form-section">
      <legend>Bicicleta e serviço</legend>
      <div class="form-grid">
        ${f({ name: 'bike', label: 'Modelo da bicicleta', placeholder: 'Marca, modelo e aro' })}
        ${f({ name: 'type', label: 'Tipo de serviço', type: 'select', options: SERVICE_TYPES })}
        ${f({ name: 'service', label: 'O que está acontecendo com a bike?', type: 'textarea', optional: true, full: true, placeholder: 'Descreva o problema ou o que deseja revisar' })}
      </div>
    </fieldset>
    <fieldset class="form-section">
      <legend>Agendamento</legend>
      <div class="form-grid">
        ${f({ name: 'date', label: 'Data desejada', type: 'date', min: dateNow() })}
        ${f({ name: 'mechanic', label: 'Profissional preferido', type: 'select', options: ['Sem preferência', ...mechanicNames()] })}
      </div>
    </fieldset>
    <div class="form-actions form-foot">${btn('Enviar solicitação', { variant: 'primary', type: 'submit' })}</div>
  </form>`;
  const aside = `<aside class="panel panel-pad aside">
    <h2 class="card-title">Como funciona</h2>
    <ol class="how how-col">${HOW_IT_WORKS.map((s, i) => `<li class="how-step"><span class="how-num">${i + 1}</span><div><p class="row-title">${esc(s.title)}</p><p class="row-meta">${esc(s.text)}</p></div></li>`).join('')}</ol>
    <p class="row-meta">Sua solicitação entra na fila da oficina e o horário é confirmado depois.</p>
  </aside>`;
  return { html: `<div class="booking">${form}${aside}</div>` };
}

function professionalsPage() {
  const names = mechanicNames();
  if (!names.length) return { html: `<div class="stack">${intro('Conheça a equipe disponível para manutenção e revisão.')}${panel(emptyState({ icon: 'users', title: 'Equipe em breve', text: 'Você pode agendar normalmente: a oficina define o mecânico.' }))}</div>` };
  const cards = names.map((name) => `<article class="panel panel-pad person">
    ${avatar(name, 'lg')}
    <div class="person-body">
      <h2 class="person-name">${esc(name)}</h2>
      <p class="row-meta">Mecânico</p>
      <p class="person-status">${statusMark('Disponível')}</p>
    </div>
    ${btn(`Agendar com ${name}`, { variant: 'primary', icon: 'calendar-plus', action: 'booking-type', data: { type: 'Manutenção', mechanic: name } })}
  </article>`).join('');
  return { html: `<div class="stack">${intro('Conheça a equipe disponível para manutenção e revisão.')}<div class="people">${cards}</div></div>` };
}

function helpPage() {
  const tips = TIPS.map((t) => `<article class="panel panel-pad tip"><span class="service-icon">${icon(t.icon, { size: 22 })}</span><h2 class="tip-title">${esc(t.title)}</h2><p>${esc(t.text)}</p></article>`).join('');
  return {
    html: `<div class="stack">${intro('Alguns cuidados simples ajudam a manter sua bike segura.')}<div class="tips">${tips}</div><div>${btn('Agendar uma revisão', { variant: 'primary', icon: 'calendar-plus', action: 'booking-type', data: { type: 'Revisão' } })}</div></div>`
  };
}

function trackingPage() {
  const render = () => {
    const list = db.jobs.filter((j) => matches(`${j.bike} ${j.customer} ${j.service}`, search));
    if (!list.length) return panel(search ? noResults() : emptyState({ icon: 'bike', title: 'Nenhum serviço registrado', text: 'Quando você agendar um serviço, o andamento aparece aqui.' }));
    return `<div class="orders">${list.map((j) => `<article class="panel order" data-status="${esc(j.status)}">
      <div class="order-head">
        <span class="service-icon">${icon(j.type === 'Revisão' ? 'clipboard-check' : 'wrench', { size: 20 })}</span>
        <div class="order-id"><h2 class="order-title">${esc(j.bike)}</h2><p class="row-meta">${esc(j.service)} · ${esc(j.customer)}</p></div>
        ${statusMark(j.status)}
      </div>
      ${steps(j.status)}
      <dl class="order-meta">
        <div><dt>Responsável</dt><dd>${esc(j.mechanic)}</dd></div>
        <div><dt>Data</dt><dd>${fmtDate(j.date)}</dd></div>
        <div><dt>Valor</dt><dd>${priceLabel(j.price)}</dd></div>
      </dl>
    </article>`).join('')}</div>`;
  };
  return {
    results: render,
    html: `<div class="stack">${intro('Acompanhe os serviços das suas bicicletas, etapa por etapa.')}<div class="toolbar">${searchField({ label: 'Buscar serviço', placeholder: 'Buscar por modelo da bicicleta' })}</div>${results(render)}</div>`
  };
}

/* ---------- Administração (dono): acessos e troca de perfil ---------- */

const ROLE_HELP = {
  customer: 'Agenda serviços, acompanha a bike e faz pedidos na loja.',
  mechanic: 'Vê ordens de serviço e estoque (sem custos), pede peças e compara preços.',
  owner: 'Acesso total: financeiro, estoque, pedidos, compras e acessos.'
};

function usersPage() {
  const roleFilter = filters.users || 'all';
  const render = () => {
    const list = accounts.filter((u) => (filters.users === 'all' || u.role === filters.users) && matches(`${u.name} ${u.email}`, search));
    return dataTable({
      label: 'Acessos ao sistema',
      rows: list,
      empty: search || filters.users !== 'all' ? noResults() : emptyState({ icon: 'users', title: 'Nenhum acesso cadastrado' }),
      columns: [
        { label: 'Nome', primary: true, render: (u) => `<span class="cell-main">${esc(u.name)}</span><span class="cell-sub">${esc(u.email)}</span>` },
        { label: 'Perfil', render: (u) => chip(ROLES[u.role].label) },
        { label: 'Criado em', nowrap: true, render: (u) => fmtDate(String(u.createdAt).slice(0, 10)) },
        { label: 'Ações', hideLabel: true, actions: true, render: (u) => (u.id === currentUser.id ? '<span class="row-meta">Você</span>' : [
          btn('Mudar perfil', { variant: 'secondary', size: 'sm', icon: 'shield-check', action: 'change-role', data: { id: u.id }, ariaLabel: `Mudar o perfil de ${u.name}` }),
          btn('Senha', { variant: 'ghost', size: 'sm', icon: 'key-round', action: 'reset-password', data: { id: u.id }, ariaLabel: `Redefinir a senha de ${u.name}` }),
          btn('Remover', { variant: 'ghost', size: 'sm', icon: 'x', action: 'delete-user', data: { id: u.id }, ariaLabel: `Remover acesso de ${u.name}` })
        ].join('')) }
      ]
    });
  };
  const count = (r) => accounts.filter((u) => u.role === r).length;
  const filter = segmented({ label: 'Filtrar por perfil', group: 'users', current: roleFilter, options: [
    { value: 'all', label: 'Todos', count: accounts.length }, { value: 'customer', label: 'Clientes', count: count('customer') },
    { value: 'mechanic', label: 'Mecânicos', count: count('mechanic') }, { value: 'owner', label: 'Donos', count: count('owner') }
  ] });
  const help = `<ul class="rows">${Object.keys(ROLE_HELP).map((r) => `<li class="row"><div class="row-main"><p class="row-title">${ROLES[r].label}</p><p class="row-meta">${ROLE_HELP[r]}</p></div></li>`).join('')}</ul>`;
  return {
    actions: btn('Novo acesso', { variant: 'primary', icon: 'plus', action: 'new-user', collapse: true }),
    results: render,
    html: `<div class="stack">${intro('Para transformar um cliente em mecânico, clique em "Mudar perfil". A pessoa precisa entrar de novo para o novo perfil valer. Clientes criam a própria conta na tela de login.')}<div class="toolbar">${searchField({ label: 'Buscar por nome ou e-mail', placeholder: 'Buscar por nome ou e-mail' })}<div class="toolbar-end">${filter}</div></div>${results(render)}${section('O que cada perfil faz', panel(help))}</div>`
  };
}

/* ---------- Pedidos da loja ---------- */

const ORDER_TONE = { 'Solicitado': 'warning', 'Pronto para retirada': 'info', 'Entregue': 'success', 'Cancelado': 'danger' };
const orderOpen = (o) => o.status === 'Solicitado' || o.status === 'Pronto para retirada';
const fmtStamp = (iso) => fmtDate(String(iso).slice(0, 10));

function ordersPage() {
  const current = filters.orders || 'open';
  const render = () => {
    const list = orders.filter((o) => (filters.orders === 'open' ? orderOpen(o) : filters.orders === 'all' || o.status === filters.orders) && matches(`${o.item} ${o.customer}`, search));
    return dataTable({
      label: 'Pedidos da loja',
      rows: list,
      empty: search ? noResults() : emptyState({ icon: 'receipt', title: 'Nenhum pedido aqui', text: 'Os pedidos feitos pelos clientes na loja aparecem nesta lista.' }),
      columns: [
        { label: 'Data', nowrap: true, render: (o) => fmtStamp(o.createdAt) },
        { label: 'Pedido', primary: true, render: (o) => `<span class="cell-main">${esc(o.item)} × ${o.qty}</span><span class="cell-sub">${esc(o.customer)}</span>` },
        { label: 'Total', align: 'right', render: (o) => money(o.total) },
        { label: 'Situação', render: (o) => statusMark(o.status, ORDER_TONE[o.status]) },
        { label: 'Ações', hideLabel: true, actions: true, render: (o) => (!orderOpen(o) ? '' : [
          o.status === 'Solicitado' ? btn('Pronto', { variant: 'ghost', size: 'sm', icon: 'check', action: 'order-status', data: { id: o.id, status: 'Pronto para retirada' }, ariaLabel: `Marcar pronto para retirada: ${o.item}` }) : '',
          btn('Entregue', { variant: 'secondary', size: 'sm', icon: 'circle-check', action: 'order-status', data: { id: o.id, status: 'Entregue' }, ariaLabel: `Marcar como entregue: ${o.item}` }),
          btn('Cancelar', { variant: 'ghost', size: 'sm', icon: 'x', action: 'order-status', data: { id: o.id, status: 'Cancelado' }, ariaLabel: `Cancelar pedido: ${o.item}` })
        ].join('')) }
      ]
    });
  };
  const open = orders.filter(orderOpen);
  const kpis = kpiGrid([
    { label: 'Em aberto', value: String(open.length), note: 'Aguardando atendimento ou retirada', icon: 'clock', tone: 'warning' },
    { label: 'Valor em aberto', value: money(open.reduce((sum, o) => sum + o.total, 0)), icon: 'circle-dollar-sign', tone: 'info' },
    { label: 'Entregues', value: String(orders.filter((o) => o.status === 'Entregue').length), note: 'Já viraram venda', icon: 'circle-check', tone: 'brand' }
  ]);
  const filter = segmented({ label: 'Filtrar pedidos', group: 'orders', current, options: [
    { value: 'open', label: 'Em aberto', count: open.length }, { value: 'Entregue', label: 'Entregues' }, { value: 'Cancelado', label: 'Cancelados' }, { value: 'all', label: 'Todos', count: orders.length }
  ] });
  return {
    results: render,
    html: `<div class="stack">${intro('Quando você marca "Entregue", o estoque é baixado e a venda entra no financeiro.')}${kpis}<div class="toolbar">${searchField({ label: 'Buscar pedido ou cliente', placeholder: 'Buscar pedido ou cliente' })}<div class="toolbar-end">${filter}</div></div>${results(render)}</div>`
  };
}

function myOrdersPage() {
  if (!orders.length) return { html: `<div class="stack">${intro('Seus pedidos da loja aparecem aqui.')}${panel(emptyState({ icon: 'shopping-bag', title: 'Nenhum pedido ainda', text: 'Escolha uma peça na loja e envie o pedido. Você paga e retira na oficina.', action: btn('Ir para a loja', { variant: 'primary', icon: 'store', action: 'go', data: { page: 'store' } }) }))}</div>` };
  const cards = orders.map((o) => `<article class="panel order" data-status="${esc(o.status)}">
    <div class="order-head">
      <span class="service-icon">${icon('shopping-bag', { size: 20 })}</span>
      <div class="order-id"><h2 class="order-title">${esc(o.item)} × ${o.qty}</h2><p class="row-meta">Pedido de ${fmtStamp(o.createdAt)}</p></div>
      ${statusMark(o.status, ORDER_TONE[o.status])}
    </div>
    <dl class="order-meta">
      <div><dt>Valor unitário</dt><dd>${money(o.unitPrice)}</dd></div>
      <div><dt>Total</dt><dd>${money(o.total)}</dd></div>
    </dl>
    ${o.status === 'Pronto para retirada' ? '<p class="row-meta">Seu pedido está pronto: passe na oficina para retirar.</p>' : ''}
    ${o.status === 'Solicitado' ? `<div>${btn('Cancelar pedido', { variant: 'ghost', size: 'sm', icon: 'x', action: 'order-status', data: { id: o.id, status: 'Cancelado' } })}</div>` : ''}
  </article>`).join('');
  return { html: `<div class="stack">${intro('Acompanhe seus pedidos da loja. Você paga e retira na oficina.')}<div class="orders">${cards}</div></div>` };
}

/* ---------- Comparador de preços ---------- */

const priceState = { q: '', loading: false, data: null, error: '' };

async function runPriceSearch(q) {
  priceState.q = q;
  priceState.loading = true;
  priceState.error = '';
  if (page === 'prices') render();
  try {
    priceState.data = await api('GET', `/api/prices?q=${encodeURIComponent(q)}`);
  } catch (e) {
    priceState.data = null;
    priceState.error = e.message;
  }
  priceState.loading = false;
  if (page === 'prices') render();
}

function pricesPage() {
  const { q, loading, data, error } = priceState;
  const form = `<form class="panel panel-pad form-stack" data-form="prices" novalidate>
    ${fieldHtml({ name: 'q', label: 'Qual peça você quer comprar?', placeholder: 'Ex.: pneu aro 29, corrente 9v, pastilha de freio', value: q, full: true }, 'prices')}
    <div class="form-actions">${btn(loading ? 'Buscando…' : 'Buscar preços', { variant: 'primary', icon: 'search', type: 'submit', disabled: loading })}</div>
  </form>`;

  const low = db.products.filter(isLowStock).slice(0, 5);
  const quick = low.length && !data ? `<div><p class="row-meta">Com estoque baixo:</p><div class="chips">${low.map((p) => btn(p.name, { size: 'sm', icon: 'tag', action: 'price-search', data: { q: p.name } })).join('')}</div></div>` : '';

  let body = '';
  if (error) body = panel(emptyState({ icon: 'circle-alert', title: 'Não foi possível buscar', text: error }));
  else if (data) {
    const links = `<ul class="rows">${data.links.map((l) => `<li class="row"><div class="row-main"><p class="row-title">${esc(l.store)}</p><p class="row-meta">Abrir a busca por “${esc(data.query)}”</p></div><a class="btn btn-secondary btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}<span class="btn-label">Abrir</span></a></li>`).join('')}</ul>`;
    let offers;
    if (data.offers.length) {
      const nums = data.offers.map((o) => o.price);
      const kp = kpiGrid([
        { label: 'Menor preço', value: money(Math.min(...nums)), note: data.offers[0].store, icon: 'tag', tone: 'brand' },
        { label: 'Maior preço', value: money(Math.max(...nums)), icon: 'trending-up', tone: 'warning' },
        { label: 'Ofertas', value: String(data.offers.length), icon: 'store', tone: 'info' }
      ]);
      const table = dataTable({
        label: 'Ofertas encontradas', rows: data.offers, empty: '',
        columns: [
          { label: 'Loja', render: (o) => `<span class="cell-main">${esc(o.store)}</span>${o.seller ? `<span class="cell-sub">${esc(o.seller)}</span>` : ''}` },
          { label: 'Produto', primary: true, render: (o) => `<span class="cell-main">${esc(o.title)}</span><span class="cell-sub">${esc([o.condition, o.freeShipping ? 'Frete grátis' : ''].filter(Boolean).join(' · '))}</span>` },
          { label: 'Preço', align: 'right', render: (o) => `<span class="cell-main">${money(o.price)}</span>${o === data.offers[0] ? '<span class="cell-sub">Menor preço</span>' : ''}` },
          { label: 'Link', hideLabel: true, actions: true, render: (o) => `<a class="btn btn-ghost btn-sm" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir oferta: ${esc(o.title)}">${icon('external-link')}<span class="btn-label">Ver</span></a>` }
        ]
      });
      offers = `${kp}${section('Ofertas, da mais barata para a mais cara', table)}`;
    } else if (data.configured) {
      offers = panel(emptyState({ icon: 'search', title: 'Nenhuma oferta encontrada', text: 'Tente um nome mais simples ou use os links das lojas abaixo.' }));
    } else {
      offers = panel(emptyState({ icon: 'tag', title: 'Busca automática não configurada', text: role === 'owner' ? 'Configure ML_CLIENT_ID e ML_CLIENT_SECRET (Mercado Livre) ou SERPAPI_KEY (Google Shopping) para ver os preços aqui. Veja o COMO-RODAR.md. Enquanto isso, use os links abaixo.' : 'Peça ao dono para ativar a busca automática. Enquanto isso, use os links abaixo.' }));
    }
    const failed = data.sources.filter((s) => !s.ok);
    const warn = failed.length ? `<p class="row-meta">Algumas fontes falharam: ${failed.map((s) => `${esc(s.name)} (${esc(s.error)})`).join('; ')}.</p>` : '';
    body = `${offers}${warn}${section('Buscar direto nas lojas', panel(links))}`;
  }
  return { html: `<div class="stack">${intro('Compare o preço de uma peça em várias lojas online antes de pedir ao fornecedor.')}${form}${loading ? panel(emptyState({ icon: 'search', title: 'Buscando os melhores preços…' })) : body}${quick}</div>` };
}
