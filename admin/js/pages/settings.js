/**
 * Configurações do site (somente administradores).
 * Tudo que é salvo aqui passa a ser usado pelo site público via /api/public/settings.php.
 */
import { api, uploadWithProgress } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { toast, setLoading, showFieldErrors, clearFieldErrors, confirmDialog, guardUnsaved } from '../core/ui.js';
import { escapeHTML } from '../core/format.js';

const form = document.getElementById('settingsForm');
const submit = document.getElementById('saveSettings');
let dirty = false;

function formatPhone(digits) {
  const d = String(digits || '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function fill(s) {
  [...form.elements].forEach((el) => {
    if (!el.name || !(el.name in s)) return;
    el.value = (el.name === 'phone' || el.name === 'whatsapp') ? formatPhone(s[el.name]) : s[el.name];
  });
  renderAsset('logo', s.logo_path);
  renderAsset('favicon', s.favicon_path);
  updatePreview();
}

function renderAsset(kind, path) {
  const box = document.getElementById(`${kind}Preview`);
  box.innerHTML = path ? `<img src="../${escapeHTML(path)}?v=${Date.now()}" alt="${kind === 'logo' ? 'Logo atual' : 'Favicon atual'}">` : 'Nenhum';
  document.getElementById(`${kind}Remove`).hidden = !path;
}

function updatePreview() {
  const digits = form.whatsapp.value.replace(/\D/g, '');
  const number = digits.length <= 11 && digits ? `55${digits}` : digits;
  const link = number ? `https://wa.me/${number}${form.whatsapp_message.value ? `?text=${encodeURIComponent(form.whatsapp_message.value)}` : ''}` : '';
  const el = document.getElementById('waPreview');
  el.innerHTML = link
    ? `Botões do site vão abrir: <a class="link" href="${escapeHTML(link)}" target="_blank" rel="noopener">${escapeHTML(link.slice(0, 60))}${link.length > 60 ? '…' : ''}</a>`
    : 'Sem WhatsApp configurado: os botões de WhatsApp ficam ocultos no site.';
}

function phoneMask(input) {
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 11);
    input.value = d.length > 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
      : d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
      : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });
}

async function uploadAsset(kind, file) {
  if (!file) return;
  const btn = document.querySelector(`[data-upload="${kind}"]`);
  setLoading(btn, true);
  try {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    const res = await uploadWithProgress('settings/upload.php', fd);
    renderAsset(kind, res.data[`${kind}_path`]);
    toast(res.message);
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function removeAsset(kind) {
  const ok = await confirmDialog({ title: kind === 'logo' ? 'Remover logo?' : 'Remover favicon?', text: 'O site volta a usar a identidade padrão.', confirmText: 'Remover', danger: true });
  if (!ok) return;
  try {
    const res = await api.post('settings/remove-asset.php', { kind });
    renderAsset(kind, '');
    toast(res.message);
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

form.addEventListener('input', (e) => {
  dirty = true;
  if (e.target.name === 'whatsapp' || e.target.name === 'whatsapp_message') updatePreview();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  const payload = {};
  [...form.elements].forEach((el) => { if (el.name && el.type !== 'file') payload[el.name] = el.value.trim(); });
  if (!payload.company_name) { showFieldErrors(form, { company_name: 'Informe o nome da imobiliária.' }); return; }

  setLoading(submit, true);
  try {
    const res = await api.post('settings/save.php', payload);
    fill(res.data);
    dirty = false;
    toast(res.message);
  } catch (err) {
    if (err.status === 422 && Object.keys(err.errors || {}).length) showFieldErrors(form, err.errors);
    else if (err.status !== 401) toast(err.message, 'error');
  } finally {
    setLoading(submit, false);
  }
});

['logo', 'favicon'].forEach((kind) => {
  document.getElementById(`${kind}File`).addEventListener('change', (e) => { uploadAsset(kind, e.target.files[0]); e.target.value = ''; });
  document.getElementById(`${kind}Remove`).addEventListener('click', () => removeAsset(kind));
});

phoneMask(form.phone);
phoneMask(form.whatsapp);
guardUnsaved(() => dirty);

(async () => {
  try {
    await initLayout({ page: 'settings', title: 'Configurações do site', crumb: 'Informações exibidas no site', roles: ['admin'] });
  } catch {
    return;
  }
  try {
    const { data } = await api.get('settings/index.php');
    fill(data);
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
})();

