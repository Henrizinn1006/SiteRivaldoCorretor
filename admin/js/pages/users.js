/**
 * Usuários do painel — SOMENTE o provedor (Vortexis). O servidor também bloqueia.
 * Administrador: imóveis, cadastros e configurações. Editor: imóveis e cadastros.
 * Senhas: a criada aqui é temporária; a pessoa cria a própria no 1º acesso.
 * Depois disso, uma nova troca só com "Liberar troca de senha".
 */
import { api } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, formModal, actionMenu, emptyState } from '../core/ui.js';
import { escapeHTML, formatDate, initials, ROLES } from '../core/format.js';

const listEl = document.getElementById('list');
let users = [];
let me;

function passwordBadge(u) {
  if (u.is_provider) return '<span class="muted">Livre (provedor)</span>';
  if (u.must_change_password) return '<span class="badge badge--reservado">Aguardando 1º acesso</span>';
  if (u.password_change_allowed) return '<span class="badge badge--disponivel">Troca liberada</span>';
  return '<span class="badge badge--indisponivel">Bloqueada</span>';
}

function render() {
  listEl.removeAttribute('aria-busy');
  if (!users.length) {
    listEl.innerHTML = emptyState({ iconName: 'users', title: 'Nenhum usuário.' });
    return;
  }
  listEl.innerHTML = `
    <div class="table-wrap">
      <table class="table table--cards">
        <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Situação</th><th scope="col">Senha</th><th scope="col">Último acesso</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${users.map((u) => `
          <tr data-id="${u.id}">
            <td class="cell-main">
              <div class="prop-cell">
                <span class="avatar" aria-hidden="true">${escapeHTML(initials(u.name))}</span>
                <div>
                  <p class="prop-cell__title">${escapeHTML(u.name)}${u.id === me.id ? ' <span class="subtle">(você)</span>' : ''}</p>
                  <p class="prop-cell__meta">${escapeHTML([u.username, u.email].filter(Boolean).join(' · '))}</p>
                </div>
              </div>
            </td>
            <td data-label="Perfil">${escapeHTML(ROLES[u.role])}${u.is_provider ? ' <span class="badge badge--vendido">Provedor</span>' : ''}</td>
            <td data-label="Situação">${u.active ? '<span class="badge badge--disponivel">Ativo</span>' : '<span class="badge badge--indisponivel">Inativo</span>'}</td>
            <td data-label="Senha">${passwordBadge(u)}</td>
            <td data-label="Último acesso" class="muted nowrap">${u.last_login_at ? escapeHTML(formatDate(u.last_login_at)) : 'Nunca acessou'}</td>
            <td class="cell-actions"><div class="row-actions">
              <button class="icon-btn" type="button" data-edit aria-label="Editar ${escapeHTML(u.name)}">${icon('edit')}</button>
              <button class="icon-btn" type="button" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações para ${escapeHTML(u.name)}" ${u.id === me.id ? 'disabled' : ''}>${icon('dots')}</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

async function load() {
  try {
    const { data } = await api.get('users/index.php');
    users = data.items;
    render();
  } catch (err) {
    if (err.status !== 401) listEl.innerHTML = emptyState({ iconName: 'alert', title: 'Não foi possível carregar.', text: err.message });
  }
}

function openForm(user = null) {
  const self = user?.id === me.id;
  formModal({
    title: user ? 'Editar usuário' : 'Novo usuário',
    submitText: user ? 'Salvar alterações' : 'Criar usuário',
    body: `
      <div class="form-field">
        <label for="uName">Nome<span class="req">*</span></label>
        <input class="input" id="uName" name="name" maxlength="120" required autocomplete="off" value="${escapeHTML(user?.name || '')}">
      </div>
      <div class="form-field">
        <label for="uUsername">Usuário de acesso<span class="req">*</span></label>
        <input class="input" id="uUsername" name="username" maxlength="40" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="Ex.: RivaldoAdmin" value="${escapeHTML(user?.username || '')}">
        <p class="form-hint">É o que a pessoa digita para entrar. Sem espaços (letras, números, ponto, hífen ou _).</p>
      </div>
      <div class="form-field">
        <label for="uEmail">E-mail <span class="subtle">(opcional)</span></label>
        <input class="input" id="uEmail" name="email" type="email" inputmode="email" autocapitalize="none" maxlength="190" autocomplete="off" value="${escapeHTML(user?.email || '')}">
      </div>
      <div class="form-field">
        <label for="uRole">Perfil de acesso<span class="req">*</span></label>
        <select class="select" id="uRole" name="role" ${self ? 'disabled' : ''}>
          <option value="editor" ${user?.role === 'editor' ? 'selected' : ''}>Editor — gerencia imóveis e cadastros</option>
          <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador — acesso completo</option>
        </select>
      </div>
      <div class="form-field">
        <label for="uPass">${user ? 'Redefinir senha' : 'Senha temporária'}${user ? '' : '<span class="req">*</span>'}</label>
        <input class="input" id="uPass" name="password" type="password" autocomplete="new-password" maxlength="200" ${user ? 'placeholder="Deixe em branco para manter"' : 'required'}>
        <p class="form-hint">${self
          ? 'Mínimo de 10 caracteres, com letras e números.'
          : 'Mínimo de 10 caracteres, com letras e números. É temporária: no próximo acesso a pessoa cria a senha dela. Envie por um canal seguro.'}</p>
      </div>
      ${self ? '' : `
      <div class="form-field">
        <label class="switch">
          <input type="checkbox" name="active" ${!user || user.active ? 'checked' : ''}>
          <span class="switch__track"></span>
          <span class="switch__label">Acesso ativo<span class="switch__text">Usuários inativos não conseguem entrar e perdem a sessão na hora.</span></span>
        </label>
      </div>`}`,
    onSubmit: async (form, close) => {
      const res = await api.post('users/save.php', {
        id: user?.id,
        name: form.name.value.trim(),
        username: form.username.value.trim(),
        email: form.email.value.trim(),
        role: self ? 'admin' : form.role.value,
        password: form.password.value,
        active: self ? true : form.active.checked,
      });
      toast(res.message);
      close();
      load();
    },
  });
}

async function setPasswordPermission(user, allow) {
  try {
    const res = await api.post('users/password-permission.php', { id: user.id, allow });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function remove(user) {
  const ok = await confirmDialog({ title: 'Excluir usuário?', text: `${user.name} perderá o acesso ao painel. Os imóveis cadastrados por ele continuam no sistema.`, confirmText: 'Excluir usuário', danger: true });
  if (!ok) return;
  try {
    const res = await api.post('users/delete.php', { id: user.id });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function toggle(user) {
  try {
    const res = await api.post('users/save.php', { id: user.id, name: user.name, username: user.username || '', email: user.email || '', role: user.role, active: !user.active });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#newUser')) { openForm(); return; }
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const user = users.find((u) => u.id === Number(row.dataset.id));
  if (e.target.closest('[data-edit]')) openForm(user);
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) {
    const items = [{ label: 'Editar', icon: 'edit', onClick: () => openForm(user) }];
    if (!user.is_provider && !user.must_change_password) {
      items.push(user.password_change_allowed
        ? { label: 'Bloquear troca de senha', icon: 'lock', onClick: () => setPasswordPermission(user, false) }
        : { label: 'Liberar troca de senha', icon: 'key', onClick: () => setPasswordPermission(user, true) });
    }
    items.push({ label: user.active ? 'Desativar acesso' : 'Reativar acesso', icon: user.active ? 'lock' : 'key', onClick: () => toggle(user) });
    if (!user.is_provider) items.push({ label: 'Excluir', icon: 'trash', danger: true, onClick: () => remove(user) });
    actionMenu(menuBtn, items);
  }
});

(async () => {
  try {
    ({ user: me } = await initLayout({ page: 'users', title: 'Usuários', crumb: 'Acesso ao painel', provider: true }));
  } catch {
    return;
  }
  load();
})();
