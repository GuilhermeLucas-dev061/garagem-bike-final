/* Diálogos e ações que alteram dados.
   As regras de negócio são as mesmas da versão anterior; mudou apenas a apresentação:
   - <dialog> nativo (foco preso, Esc fecha, fundo inerte);
   - os antigos prompt() viraram formulários no mesmo padrão;
   - erros aparecem junto do campo. */

/* Abre um diálogo com formulário.
   onSubmit(values, num) pode devolver { field, message } para manter o diálogo aberto com erro. */
function openDialog({ scope, title, description = '', fields, submitLabel, onSubmit }) {
  const titleId = `${scope}-title`;
  const body = fields.map((f, i) => fieldHtml({ ...f, autofocus: i === 0 && f.type !== 'date' }, scope)).join('');
  $('#modalroot').innerHTML = `<dialog class="dialog" aria-labelledby="${titleId}">
    <form class="dialog-panel" novalidate>
      <div class="dialog-head">
        <div><h2 class="dialog-title" id="${titleId}">${esc(title)}</h2>${description ? `<p class="dialog-desc">${description}</p>` : ''}</div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('x', { size: 18 })}</button>
      </div>
      ${fields.length ? `<div class="dialog-body"><div class="form-grid">${body}</div></div>` : ''}
      <div class="dialog-foot">
        ${btn('Cancelar', { action: 'close-modal' })}
        ${btn(submitLabel, { variant: 'primary', type: 'submit' })}
      </div>
    </form>
  </dialog>`;

  const dialog = $('#modalroot dialog');
  const form = $('form', dialog);

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !validateForm(form)) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const num = (key) => Number(values[key] || 0);
    busy = true;
    const problem = await onSubmit(values, num);
    busy = false;
    if (problem) {
      const el = form.elements[problem.field];
      setFieldError(el, problem.message);
      el.focus();
    }
  });
  /* clique no fundo (fora do painel) fecha */
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeModal(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    restoreFocus();
  });
  dialog.showModal();
}

function closeModal() {
  const dialog = $('#modalroot dialog');
  if (dialog) dialog.close();
}

/* Depois de salvar a tela é redesenhada; devolve o foco ao botão que abriu o diálogo */
let lastTrigger = null;
function restoreFocus() {
  const target = (lastTrigger && document.querySelector(lastTrigger)) || $('#pageTitle');
  target?.focus({ preventScroll: true });
}

/* Salva, redesenha e confirma. Se o navegador não conseguir salvar, só o aviso de erro aparece. */
function finish(message) {
  const saved = save();
  render();
  if (saved) toast(message);
}

function commit(message) {
  closeModal();
  finish(message);
}

/* ---------- Cadastros ---------- */

const FORM_DEFS = {
  product: {
    title: 'Cadastrar peça',
    submit: 'Salvar peça',
    fields: () => [
      { name: 'name', label: 'Nome da peça', placeholder: 'Ex.: Pneu aro 29', full: true },
      { name: 'category', label: 'Categoria', placeholder: 'Ex.: Pneus' },
      { name: 'stock', label: 'Quantidade em estoque', type: 'number' },
      { name: 'cost', label: 'Preço de custo', type: 'number', kind: 'money' },
      { name: 'price', label: 'Preço de venda', type: 'number', kind: 'money' }
    ],
    save: (f, num) => { db.products.push({ id: Date.now(), name: f.name, category: f.category, cost: num('cost'), price: num('price'), stock: num('stock') }); }
  },
  job: {
    title: 'Nova ordem de serviço',
    submit: 'Criar ordem',
    fields: () => [
      { name: 'customer', label: 'Cliente', placeholder: 'Nome do cliente' },
      { name: 'bike', label: 'Modelo da bicicleta', placeholder: 'Marca e modelo' },
      { name: 'type', label: 'Tipo de serviço', type: 'select', options: SERVICE_TYPES },
      { name: 'mechanic', label: 'Mecânico responsável', type: 'select', options: [...mechanicNames(), 'A definir'] },
      { name: 'service', label: 'Serviço a realizar', placeholder: 'Ex.: Revisão completa', full: true },
      { name: 'price', label: 'Valor estimado', type: 'number', kind: 'money' },
      { name: 'date', label: 'Data', type: 'date', value: dateNow() },
      { name: 'status', label: 'Status', type: 'select', options: ['Aguardando', 'Em andamento', 'Pronta'] }
    ],
    save: (f, num) => { db.jobs.unshift({ id: Date.now(), ...f, price: num('price'), status: f.status || 'Aguardando' }); }
  },
  sale: {
    title: 'Registrar venda',
    submit: 'Registrar venda',
    fields: () => [
      { name: 'product', label: 'Produto', type: 'select', full: true, options: db.products.map((p) => ({ value: p.id, label: `${p.name} — estoque ${p.stock} — ${money(p.price)}` })) },
      { name: 'qty', label: 'Quantidade', type: 'number', value: 1 },
      { name: 'customer', label: 'Nome do cliente', placeholder: 'Cliente balcão', value: 'Cliente balcão' }
    ],
    save: (f, num) => {
      const product = db.products.find((p) => p.id === Number(f.product));
      const qty = num('qty');
      if (!product || qty < 1 || product.stock < qty) return { field: 'qty', message: 'Estoque insuficiente para essa venda.' };
      product.stock -= qty;
      db.sales.unshift({ id: Date.now(), item: product.name, qty, price: product.price, cost: product.cost, date: dateNow(), customer: f.customer || 'Cliente balcão' });
    }
  },
  expense: {
    title: 'Registrar despesa externa',
    submit: 'Salvar despesa',
    fields: () => [
      { name: 'item', label: 'Descrição', placeholder: 'Ex.: internet, água' },
      { name: 'price', label: 'Valor', type: 'number', kind: 'money' },
      { name: 'category', label: 'Categoria', placeholder: 'Fora da oficina' },
      { name: 'date', label: 'Data', type: 'date', value: dateNow() }
    ],
    save: (f, num) => { db.expenses.unshift({ id: Date.now(), ...f, price: num('price') }); }
  },
  request: {
    title: 'Pedir peças',
    submit: 'Enviar pedido',
    fields: () => [
      { name: 'item', label: 'Peça necessária', placeholder: 'Ex.: pneu aro 29', full: true },
      { name: 'qty', label: 'Quantidade', type: 'number' },
      { name: 'priority', label: 'Prioridade', type: 'select', options: ['Normal', 'Alta', 'Baixa'] },
      { name: 'date', label: 'Data do pedido', type: 'date', value: dateNow() }
    ],
    save: (f, num) => { db.requests.unshift({ id: Date.now(), ...f, qty: num('qty'), status: 'Solicitado' }); }
  }
};

function openModal(type) {
  if (type === 'purchase') return openPurchaseDialog();
  const def = FORM_DEFS[type];
  if (!def) return;
  openDialog({
    scope: `modal-${type}`,
    title: def.title,
    submitLabel: def.submit,
    fields: def.fields(),
    onSubmit: (f, num) => {
      const problem = def.save(f, num);
      if (problem) return problem;
      commit('Informações salvas com sucesso!');
    }
  });
}

/* ---------- Ordens de serviço ---------- */

function editJob(id) {
  const job = db.jobs.find((x) => x.id === id);
  if (!job) return;
  openDialog({
    scope: 'edit-job',
    title: 'Atualizar serviço',
    description: `<strong>${esc(job.bike)}</strong> · ${esc(job.service)}`,
    submitLabel: 'Salvar atualização',
    fields: [
      { name: 'status', label: 'Status', type: 'select', value: job.status, options: ['Aguardando', 'Em andamento', 'Pronta', 'Concluído'] },
      { name: 'mechanic', label: 'Mecânico responsável', type: 'select', value: job.mechanic, options: [...mechanicNames(), 'A definir'] }
    ],
    onSubmit: (f) => {
      Object.assign(job, f);
      commit('Status do serviço atualizado!');
    }
  });
}

function submitBooking(form) {
  const f = Object.fromEntries(new FormData(form).entries());
  db.jobs.unshift({
    id: Date.now(),
    bike: f.bike,
    customer: f.customer,
    type: f.type,
    service: (f.service || 'Serviço solicitado') + (f.contact ? ' · Contato: ' + f.contact : ''),
    mechanic: f.mechanic === 'Sem preferência' ? 'A definir' : f.mechanic,
    status: 'Aguardando',
    date: f.date,
    price: 0
  });
  finish('Solicitação enviada! A oficina poderá confirmar o horário.');
}

/* Leva ao agendamento já com o tipo (e o profissional) escolhidos */
function bookingType(type, mechanic) {
  go('booking');
  const typeEl = $('#booking-type');
  if (typeEl) typeEl.value = type;
  const mechanicEl = $('#booking-mechanic');
  if (mechanic && mechanicEl) mechanicEl.value = mechanic;
}

/* ---------- Estoque, pedidos e loja ---------- */

function adjustStock(id) {
  const product = db.products.find((x) => x.id === id);
  if (!product) return;
  openDialog({
    scope: 'adjust-stock',
    title: 'Ajustar estoque',
    description: `<strong>${esc(product.name)}</strong> · Quantidade atual: ${product.stock}`,
    submitLabel: 'Salvar quantidade',
    fields: [{ name: 'stock', label: 'Nova quantidade', type: 'number', value: product.stock }],
    onSubmit: (f, num) => {
      product.stock = num('stock');
      commit('Estoque atualizado!');
    }
  });
}

function completeRequest(id) {
  const request = db.requests.find((x) => x.id === id);
  if (!request) return;
  request.status = 'Recebido';
  const product = db.products.find((x) => x.name.toLowerCase() === request.item.toLowerCase());
  if (product) product.stock += Number(request.qty);
  finish('Pedido marcado como recebido!');
}

/* Cliente: cria um pedido no banco (o dono confirma e entrega). Dono: lança a venda na hora. */
function buyProduct(id) {
  const product = db.products.find((x) => x.id === id);
  if (!product) return;
  if (product.stock < 1) {
    toast('Produto indisponível no estoque.', 'error');
    return;
  }
  const isCustomer = role === 'customer';
  openDialog({
    scope: 'buy-product',
    title: isCustomer ? 'Fazer pedido' : 'Registrar venda',
    description: isCustomer
      ? `${esc(product.name)} por <strong>${money(product.price)}</strong> a unidade. Você paga e retira na oficina; o pedido fica em <strong>Minhas compras</strong>.`
      : `${esc(product.name)} por <strong>${money(product.price)}</strong>. Informe o nome do cliente para registrar a venda.`,
    submitLabel: isCustomer ? 'Enviar pedido' : 'Registrar venda',
    fields: isCustomer
      ? [{ name: 'qty', label: 'Quantidade', type: 'number', min: 1, value: 1, hint: `Disponível: ${product.stock}` }]
      : [{ name: 'customer', label: 'Nome do cliente', placeholder: 'Cliente balcão', full: true }],
    onSubmit: async (f) => {
      if (isCustomer) {
        const qty = Number(f.qty);
        if (!Number.isInteger(qty) || qty < 1) return { field: 'qty', message: 'Informe uma quantidade inteira.' };
        try {
          orders = (await api('POST', '/api/orders', { productId: product.id, qty })).orders;
          await loadData();
        } catch (e) {
          return { field: 'qty', message: e.message };
        }
        closeModal();
        render();
        toast('Pedido enviado! Acompanhe em Minhas compras.');
        return undefined;
      }
      const customer = f.customer.trim();
      if (!customer) return { field: 'customer', message: 'Preencha este campo.' };
      db.sales.unshift({ id: Date.now(), item: product.name, qty: 1, price: product.price, cost: product.cost, date: dateNow(), customer });
      product.stock--;
      commit('Venda registrada!');
      return undefined;
    }
  });
}

/* ---------- Compras de fornecedores (gravadas no banco, uma a uma) ---------- */

function openPurchaseDialog() {
  openDialog({
    scope: 'purchase',
    title: 'Registrar compra',
    description: 'Se for uma peça cadastrada, a quantidade entra no estoque automaticamente.',
    submitLabel: 'Salvar compra',
    fields: [
      { name: 'productId', label: 'Peça do estoque', type: 'select', optional: true, full: true, options: [{ value: '', label: 'Outro item (não entra no estoque)' }, ...db.products.map((p) => ({ value: p.id, label: p.name }))] },
      { name: 'item', label: 'Descrição do item', optional: true, placeholder: 'Obrigatória se não escolher uma peça', full: true },
      { name: 'supplier', label: 'Fornecedor', optional: true, placeholder: 'Nome do fornecedor' },
      { name: 'qty', label: 'Quantidade', type: 'number', min: 1, value: 1 },
      { name: 'price', label: 'Valor total pago', type: 'number', kind: 'money' },
      { name: 'date', label: 'Data', type: 'date', value: dateNow() }
    ],
    onSubmit: async (f) => {
      if (!f.productId && !f.item.trim()) return { field: 'item', message: 'Descreva o item ou escolha uma peça.' };
      if (!Number.isInteger(Number(f.qty))) return { field: 'qty', message: 'Informe uma quantidade inteira.' };
      try {
        purchases = (await api('POST', '/api/purchases', f)).purchases;
        if (f.productId) await loadData(); /* o estoque mudou */
      } catch (e) {
        return { field: 'item', message: e.message };
      }
      closeModal();
      render();
      toast('Compra registrada.');
      return undefined;
    }
  });
}

function deletePurchase(id) {
  const target = purchases.find((p) => p.id === id);
  if (!target) return;
  openDialog({
    scope: 'delete-purchase',
    title: 'Excluir compra',
    description: `<strong>${esc(target.item)}</strong> (${money(target.price)}) será removida do histórico. O estoque não é alterado.`,
    submitLabel: 'Excluir compra',
    fields: [],
    onSubmit: async () => {
      try {
        purchases = (await api('DELETE', `/api/purchases/${encodeURIComponent(id)}`)).purchases;
        toast('Compra excluída.');
      } catch (e) {
        toast(e.message, 'error');
      }
      closeModal();
      render();
      return undefined;
    }
  });
}

/* ---------- Pedidos da loja ---------- */

async function setOrderStatus(id, status) {
  const order = orders.find((o) => o.id === id);
  if (!order) return;
  const run = async () => {
    try {
      orders = (await api('PATCH', `/api/orders/${encodeURIComponent(id)}`, { status })).orders;
      if (status === 'Entregue') await loadData(); /* estoque e vendas mudaram */
      toast(status === 'Entregue' ? 'Pedido entregue e venda registrada.' : status === 'Cancelado' ? 'Pedido cancelado.' : 'Pedido atualizado.');
    } catch (e) {
      toast(e.message, 'error');
    }
    render();
  };
  if (status !== 'Cancelado') return run();
  openDialog({
    scope: 'cancel-order',
    title: 'Cancelar pedido',
    description: `${esc(order.item)} (${order.qty} un.) de <strong>${esc(order.customer)}</strong>.`,
    submitLabel: 'Cancelar pedido',
    fields: [],
    onSubmit: async () => { closeModal(); await run(); return undefined; }
  });
  return undefined;
}

function saveGoal(form) {
  db.goal = Number(new FormData(form).get('goal'));
  finish('Meta mensal atualizada!');
}
