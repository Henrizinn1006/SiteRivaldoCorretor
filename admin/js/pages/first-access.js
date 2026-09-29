/**
 * Primeiro acesso: a pessoa entrou com a senha temporária e cria a senha pessoal.
 * O servidor bloqueia todo o painel (403) até esta troca ser feita.
 */
import { api, setCsrfToken } from '../core/api.js';
import { injectIcons } from '../core/icons.js';
import { setLoading, showFieldErrors, clearFieldErrors } from '../core/ui.js';
import { registerServiceWorker } from '../core/pwa.js';

injectIcons();
registerServiceWorker();

const form = document.getElementById('passwordForm');
const submit = document.getElementById('submitBtn');
const notice = document.getElementById('notice');

function showNotice(message) {
  notice.textContent = message;
  notice.className = 'notice notice--error';
  notice.hidden = false;
}

async function logout() {
  try { await api.post('auth/logout.php', {}); } catch { /* segue para o login */ }
  window.location.replace('login.html?motivo=saiu');
}
document.querySelector('[data-logout]').addEventListener('click', logout);

(async () => {
  let user;
  try {
    const res = await api.get('auth/me.php');
    setCsrfToken(res.data.csrf_token);
    user = res.data.user;
  } catch {
    return; // 401 → o cliente da API já leva para o login
  }
  if (!user.must_change_password) {
    window.location.replace('index.html');
    return;
  }
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user.name; });
  form.querySelector('[data-user-login]').value = user.username || user.email || '';
  document.body.classList.remove('is-booting');
  form.current_password.focus();
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submit.disabled) return;
  notice.hidden = true;
  clearFieldErrors(form);

  const data = {
    current_password: form.current_password.value,
    password: form.password.value,
    password_confirmation: form.password_confirmation.value,
  };
  const errors = {};
  if (!data.current_password) errors.current_password = 'Informe a senha temporária que você recebeu.';
  if (data.password.length < 10 || !/[a-zA-ZÀ-ÿ]/.test(data.password) || !/\d/.test(data.password)) {
    errors.password = 'A senha precisa ter pelo menos 10 caracteres, com letras e números.';
  }
  if (data.password !== data.password_confirmation) errors.password_confirmation = 'As senhas não conferem.';
  if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }

  setLoading(submit, true, 'Salvando…');
  try {
    const res = await api.post('profile/password.php', data);
    setCsrfToken(res.data.csrf_token);
    window.location.replace('index.html');
  } catch (err) {
    setLoading(submit, false);
    if (err.status === 422 && Object.keys(err.errors || {}).length) showFieldErrors(form, err.errors);
    else if (err.status !== 401) showNotice(err.message);
  }
});
