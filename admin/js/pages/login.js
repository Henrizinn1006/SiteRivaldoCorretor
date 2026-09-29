/**
 * Tela de login.
 * A validação aqui é só para conforto do usuário — o servidor valida tudo de novo.
 */
import { api } from '../core/api.js';
import { injectIcons } from '../core/icons.js';
import { setLoading, showFieldErrors, clearFieldErrors } from '../core/ui.js';
import { registerServiceWorker, onInstallAvailable, promptInstall } from '../core/pwa.js';

injectIcons();
registerServiceWorker();

const installBtn = document.getElementById('installApp');
onInstallAvailable((available) => { installBtn.hidden = !available; });
installBtn.addEventListener('click', promptInstall);

const form = document.getElementById('loginForm');
const notice = document.getElementById('loginNotice');
const submit = document.getElementById('loginSubmit');
const password = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const capsWarning = document.getElementById('capsWarning');

const params = new URLSearchParams(window.location.search);

/** Só aceita páginas internas do painel (evita redirecionamento para sites externos). */
function safeNext() {
  const next = params.get('next') || '';
  return /^[a-z0-9-]+\.html(\?[a-z0-9=&_%-]*)?$/i.test(next) && !next.startsWith('login.html')
    ? next
    : 'index.html';
}

function showNotice(message, type = 'error') {
  notice.className = `notice notice--${type}`;
  notice.setAttribute('role', type === 'error' ? 'alert' : 'status');
  notice.textContent = message;
  notice.hidden = false;
}

const REASONS = {
  expirada: ['Sua sessão expirou. Entre novamente para continuar.', 'warning'],
  saiu: ['Você saiu do painel com segurança.', 'success'],
};
if (REASONS[params.get('motivo')]) {
  showNotice(...REASONS[params.get('motivo')]);
}

/** Primeiro acesso (senha temporária) → tela para criar a senha pessoal. */
const destination = (user) => (user?.must_change_password ? 'trocar-senha.html' : safeNext());

// Já está logado? Vai direto para o painel.
api.get('auth/me.php', undefined, { skipAuthRedirect: true })
  .then((res) => window.location.replace(destination(res.data.user)))
  .catch(() => document.getElementById('login').focus());

// Mostrar/ocultar senha
togglePassword.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  togglePassword.setAttribute('aria-pressed', String(show));
  togglePassword.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  togglePassword.querySelector('use').setAttribute('href', show ? '#i-eyeOff' : '#i-eye');
  password.focus();
});

// Aviso de Caps Lock
password.addEventListener('keyup', (e) => {
  capsWarning.hidden = !(e.getModifierState && e.getModifierState('CapsLock'));
});

function validate(data) {
  const errors = {};
  if (!data.login) errors.login = 'Informe seu usuário ou e-mail.';
  if (!data.password) errors.password = 'Informe sua senha.';
  return errors;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submit.disabled) return;

  notice.hidden = true;
  clearFieldErrors(form);

  const data = {
    login: form.login.value.trim(),
    password: form.password.value,
  };

  const errors = validate(data);
  if (Object.keys(errors).length) {
    showFieldErrors(form, errors);
    return;
  }

  setLoading(submit, true, 'Entrando…');
  try {
    const res = await api.post('auth/login.php', data, { skipAuthRedirect: true });
    window.location.replace(destination(res.data.user));
  } catch (err) {
    setLoading(submit, false);
    if (err.status === 422 && Object.keys(err.errors).length) {
      showFieldErrors(form, err.errors);
    } else {
      showNotice(err.message, err.status === 429 ? 'warning' : 'error');
      password.value = '';
      password.focus();
    }
  }
});
