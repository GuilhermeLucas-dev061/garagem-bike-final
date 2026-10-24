/* Gestão de acessos (dono) e troca de senha (qualquer perfil). Tudo passa pelo servidor. */

/* Escolhe o campo onde mostrar a mensagem de erro devolvida pela API */
function fieldForError(message) {
  const m = message.toLowerCase();
  if (m.includes('mail')) return 'email';
  if (m.includes('senha')) return 'password';
  return 'name';
}

function openUserDialog() {
  openDialog({
    scope: 'new-user',
    title: 'Novo acesso',
    description: 'A pessoa entra com o e-mail e a senha que você definir aqui.',
    submitLabel: 'Criar acesso',
    fields: [
      { name: 'name', label: 'Nome completo', full: true },
      { name: 'email', label: 'E-mail', type: 'email', autocomplete: 'off' },
      { name: 'role', label: 'Perfil', type: 'select', value: 'mechanic', options: [{ value: 'mechanic', label: 'Mecânico' }, { value: 'owner', label: 'Dono' }, { value: 'customer', label: 'Cliente' }] },
      { name: 'password', label: 'Senha inicial', type: 'password', autocomplete: 'new-password', hint: 'Mínimo de 8 caracteres.', full: true }
    ],
    onSubmit: async (values) => {
      try {
        accounts = (await api('POST', '/api/users', values)).users;
      } catch (e) {
        return { field: fieldForError(e.message), message: e.message };
      }
      closeModal();
      render();
      toast('Acesso criado.');
      return undefined;
    }
  });
}

function deleteUser(id) {
  const target = accounts.find((u) => u.id === id);
  if (!target) return;
  openDialog({
    scope: 'delete-user',
    title: 'Remover acesso',
    description: `<strong>${esc(target.name)}</strong> não conseguirá mais entrar no sistema.`,
    submitLabel: 'Remover acesso',
    fields: [],
    onSubmit: async () => {
      try {
        accounts = (await api('DELETE', `/api/users/${id}`)).users;
        closeModal();
        render();
        toast('Acesso removido.');
      } catch (e) {
        closeModal();
        toast(e.message, 'error');
      }
      return undefined;
    }
  });
}

function openPasswordDialog() {
  openDialog({
    scope: 'password',
    title: 'Alterar senha',
    submitLabel: 'Salvar senha',
    fields: [
      { name: 'current', label: 'Senha atual', type: 'password', autocomplete: 'current-password', full: true },
      { name: 'next', label: 'Nova senha', type: 'password', autocomplete: 'new-password', hint: 'Mínimo de 8 caracteres.', full: true },
      { name: 'again', label: 'Repita a nova senha', type: 'password', autocomplete: 'new-password', full: true }
    ],
    onSubmit: async (values) => {
      if (values.next !== values.again) return { field: 'again', message: 'As senhas não conferem.' };
      try {
        await api('POST', '/api/password', { current: values.current, next: values.next });
      } catch (e) {
        return { field: e.message.includes('atual') ? 'current' : 'next', message: e.message };
      }
      closeModal();
      toast('Senha alterada.');
      return undefined;
    }
  });
}

/* Mudar o perfil de uma pessoa (ex.: cliente -> mecânico). Vale no próximo login dela. */
function changeRole(id) {
  const target = accounts.find((u) => u.id === id);
  if (!target) return;
  openDialog({
    scope: 'change-role',
    title: 'Mudar perfil',
    description: `<strong>${esc(target.name)}</strong> hoje é <strong>${esc(ROLES[target.role].label)}</strong>. Ao salvar, a pessoa sai do sistema e o novo perfil vale quando ela entrar de novo.<br>${Object.keys(ROLE_HELP).map((r) => `<strong>${ROLES[r].label}:</strong> ${esc(ROLE_HELP[r])}`).join('<br>')}`,
    submitLabel: 'Salvar perfil',
    fields: [{ name: 'role', label: 'Novo perfil', type: 'select', value: target.role, full: true, options: Object.keys(ROLE_HELP).map((r) => ({ value: r, label: ROLES[r].label })) }],
    onSubmit: async (values) => {
      try {
        accounts = (await api('PATCH', `/api/users/${id}/role`, { role: values.role })).users;
        await loadData(); /* a lista de mecânicos mudou */
      } catch (e) {
        return { field: 'role', message: e.message };
      }
      closeModal();
      render();
      toast(`${target.name} agora é ${ROLES[values.role].label.toLowerCase()}.`);
      return undefined;
    }
  });
}

/* O dono define uma nova senha para quem esqueceu (não há recuperação por e-mail) */
function resetPassword(id) {
  const target = accounts.find((u) => u.id === id);
  if (!target) return;
  openDialog({
    scope: 'reset-password',
    title: 'Redefinir senha',
    description: `Defina uma nova senha para <strong>${esc(target.name)}</strong> e combine com a pessoa. As sessões abertas dela serão encerradas.`,
    submitLabel: 'Salvar nova senha',
    fields: [{ name: 'password', label: 'Nova senha', type: 'password', autocomplete: 'new-password', hint: 'Mínimo de 8 caracteres.', full: true }],
    onSubmit: async (values) => {
      try {
        await api('POST', `/api/users/${id}/password`, { password: values.password });
      } catch (e) {
        return { field: 'password', message: e.message };
      }
      closeModal();
      toast('Senha redefinida.');
      return undefined;
    }
  });
}
