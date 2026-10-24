/* Tela de entrada: login, criação de conta de cliente e primeiro acesso (conta do dono). */

const POINTS = [
  ['clipboard-list', 'Ordens de serviço e fila da oficina'],
  ['package', 'Estoque, compras e vendas'],
  ['bike', 'Cliente acompanha a bike em tempo real']
];

$('#points').innerHTML = POINTS.map(([name, text]) => `<li>${icon(name, { size: 18 })}<span>${text}</span></li>`).join('');

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'garagem' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data;
}

/* Campo de senha com botão de mostrar/ocultar */
function passwordField(name, label, autocomplete, hint = '') {
  const id = `f-${name}`;
  return `<div class="field">
    <label class="label" for="${id}">${label}</label>
    <div class="input-affix input-affix-end">
      <input class="input" id="${id}" name="${name}" type="password" required autocomplete="${autocomplete}"${hint ? ` aria-describedby="${id}-hint"` : ''}>
      <button type="button" class="reveal" data-reveal="${id}" aria-label="Mostrar senha" aria-pressed="false">${icon('eye', { size: 18 })}</button>
    </div>
    ${hint ? `<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}
  </div>`;
}

function formHtml(mode) {
  const text = (name, label, type = 'text', autocomplete = 'off') => fieldHtml({ name, label, type, autocomplete, full: true }, 'f');
  if (mode === 'login') {
    return `<form data-mode="login" novalidate>
      ${text('email', 'E-mail', 'email', 'username')}
      ${passwordField('password', 'Senha', 'current-password')}
      <p class="auth-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>`;
  }
  return `<form data-mode="${mode}" novalidate>
    ${text('name', mode === 'setup' ? 'Seu nome' : 'Nome completo', 'text', 'name')}
    ${text('email', 'E-mail', 'email', 'username')}
    ${passwordField('password', 'Senha', 'new-password', 'Mínimo de 8 caracteres.')}
    ${passwordField('again', 'Repita a senha', 'new-password')}
    <p class="auth-error" role="alert" hidden></p>
    <button class="btn btn-primary btn-block" type="submit">${mode === 'setup' ? 'Criar conta do dono' : 'Criar conta'}</button>
  </form>`;
}

function show(mode, needsSetup) {
  const tabs = needsSetup ? '' : `<div class="auth-tabs" role="tablist" aria-label="Acesso">
      <button type="button" role="tab" id="tab-login" aria-selected="${mode === 'login'}" aria-controls="panel" data-mode="login">Entrar</button>
      <button type="button" role="tab" id="tab-register" aria-selected="${mode === 'register'}" aria-controls="panel" data-mode="register">Criar conta</button>
    </div>`;
  const heading = needsSetup ? ['Primeiro acesso', 'Crie a conta do dono para começar a usar o sistema.']
    : mode === 'login' ? ['Bem-vindo de volta', 'Entre com seu e-mail e senha.'] : ['Criar conta de cliente', 'Agende serviços e acompanhe sua bike.'];
  $('#card').innerHTML = `${tabs}<div id="panel" ${needsSetup ? '' : `role="tabpanel" aria-labelledby="tab-${mode}"`}>
    <h1 class="auth-title">${heading[0]}</h1>
    <p class="auth-sub">${heading[1]}</p>
    ${formHtml(needsSetup ? 'setup' : mode)}
  </div>`;
  document.title = `${heading[0]} · Garagem Bike`;
  $('#card input')?.focus();
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-mode][role="tab"]');
  if (tab) show(tab.dataset.mode, false);

  const reveal = e.target.closest('[data-reveal]');
  if (reveal) {
    const input = $(`#${reveal.dataset.reveal}`);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(visible));
    reveal.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    reveal.innerHTML = icon(visible ? 'eye-off' : 'eye', { size: 18 });
  }
});

/* Setas esquerda/direita alternam as abas (padrão de abas acessíveis) */
document.addEventListener('keydown', (e) => {
  const tab = e.target.closest?.('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const next = tab.dataset.mode === 'login' ? 'register' : 'login';
  show(next, false);
  $(`#tab-${next}`).focus();
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-mode]');
  if (!form) return;
  e.preventDefault();
  const error = $('.auth-error', form);
  error.hidden = true;
  if (!validateForm(form)) return;

  const mode = form.dataset.mode;
  const values = Object.fromEntries(new FormData(form).entries());
  if (mode !== 'login' && values.password !== values.again) {
    error.textContent = 'As senhas não conferem.';
    error.hidden = false;
    return;
  }
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  try {
    const url = { login: '/api/login', register: '/api/register', setup: '/api/setup' }[mode];
    await call('POST', url, { name: values.name, email: values.email, password: values.password });
    window.location.href = '/';
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    button.disabled = false;
  }
});

(async function start() {
  try {
    const { needsSetup, loggedIn } = await call('GET', '/api/status');
    if (loggedIn) { window.location.href = '/'; return; } /* já logado: vai direto para o painel */
    show('login', needsSetup);
  } catch (e) {
    $('#card').innerHTML = '<p class="auth-error" role="alert">Não foi possível falar com o servidor. Verifique se ele está em execução.</p>';
  }
})();
