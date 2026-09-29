/**
 * Meu perfil: nome, e-mail (pede a senha atual) e troca de senha.
 */
import { api, setCsrfToken } from '../core/api.js';
import { initLayout, setUser } from '../core/layout.js';
import { toast, setLoading, showFieldErrors, clearFieldErrors } from '../core/ui.js';
import { ROLES } from '../core/format.js';

const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
let me;

function handleError(form, err) {
  if (err.status === 422 && Object.keys(err.errors || {}).length) showFieldErrors(form, err.errors);
  else if (err.status !== 401) toast(err.message, 'error');
}

function toggleCurrentPassword() {
  const changed = profileForm.email.value.trim().toLowerCase() !== (me.email || '');
  document.getElementById('emailConfirm').hidden = !changed;
}

/** Troca de senha: provedor sempre; demais só com liberação do provedor (vale uma vez). */
function renderPasswordState() {
  const status = document.getElementById('pwStatus');
  const fields = document.getElementById('pwFields');
  const submit = document.getElementById('pwSubmit');
  const locked = !me.can_change_password;
  fields.disabled = locked;
  fields.classList.toggle('is-locked', locked);
  submit.disabled = locked;
  if (me.is_provider) {
    status.hidden = true;
  } else if (locked) {
    status.className = 'notice notice--warning';
    status.innerHTML = '<b>Troca de senha bloqueada.</b> Para alterar sua senha, peça a liberação ao provedor do sistema (Vortexis).';
    status.hidden = false;
  } else {
    status.className = 'notice notice--success';
    status.innerHTML = '<b>Troca de senha liberada.</b> Você pode alterar sua senha uma vez. Depois ela volta a ficar bloqueada.';
    status.hidden = false;
  }
}

profileForm.email.addEventListener('input', toggleCurrentPassword);

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(profileForm);
  const btn = profileForm.querySelector('[type="submit"]');
  setLoading(btn, true);
  try {
    const res = await api.post('profile/update.php', {
      name: profileForm.name.value.trim(),
      email: profileForm.email.value.trim(),
      current_password: profileForm.current_password.value,
    });
    me = res.data.user;
    setUser(me);
    profileForm.current_password.value = '';
    toggleCurrentPassword();
    toast(res.message);
  } catch (err) {
    handleError(profileForm, err);
  } finally {
    setLoading(btn, false);
  }
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(passwordForm);
  const data = {
    current_password: passwordForm.current_password.value,
    password: passwordForm.password.value,
    password_confirmation: passwordForm.password_confirmation.value,
  };
  const errors = {};
  if (!data.current_password) errors.current_password = 'Informe sua senha atual.';
  if (data.password.length < 10 || !/[a-zA-ZÀ-ÿ]/.test(data.password) || !/\d/.test(data.password)) {
    errors.password = 'A senha precisa ter pelo menos 10 caracteres, com letras e números.';
  }
  if (data.password !== data.password_confirmation) errors.password_confirmation = 'As senhas não conferem.';
  if (Object.keys(errors).length) { showFieldErrors(passwordForm, errors); return; }

  const btn = passwordForm.querySelector('[type="submit"]');
  setLoading(btn, true);
  try {
    const res = await api.post('profile/password.php', data);
    setCsrfToken(res.data.csrf_token);
    passwordForm.reset();
    me = { ...me, ...res.data.user };
    renderPasswordState();
    toast(res.message);
  } catch (err) {
    handleError(passwordForm, err);
  } finally {
    setLoading(btn, false);
  }
});

(async () => {
  try {
    ({ user: me } = await initLayout({ page: 'profile', title: 'Meu perfil', crumb: 'Seus dados de acesso' }));
  } catch {
    return;
  }
  profileForm.name.value = me.name;
  profileForm.email.value = me.email || '';
  document.getElementById('p-username').value = me.username || '—';
  document.getElementById('roleInfo').textContent = me.is_provider ? `${ROLES[me.role]} · Provedor` : ROLES[me.role];
  renderPasswordState();
})();
