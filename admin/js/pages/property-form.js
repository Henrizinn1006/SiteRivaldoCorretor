/**
 * Cadastro / edição de imóvel em 6 etapas.
 * - "Salvar rascunho" grava sem exigir tudo; "Publicar" exige os campos essenciais.
 * - Rascunhos são salvos automaticamente a cada 30 s quando há alterações.
 * - Avisa antes de sair com alterações não salvas.
 */
import { api } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { icon } from '../core/icons.js';
import { toast, setLoading, showFieldErrors, clearFieldErrors, guardUnsaved } from '../core/ui.js';
import { escapeHTML, STATUS } from '../core/format.js';
import { moneyInput, parseMoney, formatMoney, parseDecimal, formatDecimal } from '../core/money.js';
import { Gallery } from '../core/gallery.js';

const STEPS = [
  { id: 'basic',    label: 'Informações básicas' },
  { id: 'location', label: 'Localização' },
  { id: 'values',   label: 'Valores' },
  { id: 'details',  label: 'Características' },
  { id: 'photos',   label: 'Fotografias' },
  { id: 'publish',  label: 'Publicação' },
];

/** Em qual etapa está cada campo (para levar o usuário ao erro). */
const FIELD_STEP = {
  title: 0, transaction_type: 0, property_type_id: 0, description: 0, slug: 0,
  zip_code: 1, city_id: 1, neighborhood_name: 1, zone: 1, address: 1, number: 1, complement: 1, latitude: 1, longitude: 1,
  price: 2, price_from: 2, old_price: 2, condominium_fee: 2, property_tax: 2,
  total_area: 3, usable_area: 3, bedrooms: 3, suites: 3, bathrooms: 3, parking_spaces: 3,
  status: 5,
};
const MONEY = ['price', 'old_price', 'condominium_fee', 'property_tax'];
const DECIMAL = ['total_area', 'usable_area', 'latitude', 'longitude'];
const COUNTERS = ['bedrooms', 'suites', 'bathrooms', 'parking_spaces'];
const AUTOSAVE_MS = 30000;

const form = document.getElementById('propertyForm');
const stepper = document.getElementById('stepper');
const sections = [...form.querySelectorAll('.form-section')];
const $ = (id) => document.getElementById(id);

const state = {
  id: Number(new URLSearchParams(window.location.search).get('id')) || null,
  property: null,
  catalogs: { types: [], cities: [], neighborhoods: [], features: [], zones: {} },
  step: 0,
  dirty: false,
  saving: false,
  slugTouched: false,
  lastSaved: null,
};

let gallery;

/* ------------------------------------------------------------ Etapas */

function renderStepper() {
  stepper.innerHTML = STEPS.map((s, i) => `
    <button class="step" type="button" data-step="${i}" ${i === state.step ? 'aria-current="step"' : ''}>
      <span class="step__num">${i + 1}</span><span>${s.label}</span>
    </button>`).join('') + `
    <div class="stepper__meta">
      <span>Código: <b id="metaCode">${escapeHTML(state.property?.code || 'gerado ao salvar')}</b></span>
      <span>Situação: <b id="metaStatus">${escapeHTML(statusLabel())}</b></span>
    </div>`;
}

function statusLabel() {
  if (!state.property) return 'Novo imóvel';
  return state.property.published ? `Publicado · ${STATUS[state.property.status]}` : 'Rascunho';
}

function goTo(index, focus = true) {
  state.step = Math.max(0, Math.min(STEPS.length - 1, index));
  sections.forEach((s, i) => s.classList.toggle('is-active', i === state.step));
  stepper.querySelectorAll('.step').forEach((b, i) => {
    if (i === state.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  stepper.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  $('prevStep').disabled = state.step === 0;
  $('nextStep').hidden = state.step === STEPS.length - 1;
  if (state.step === 5) updateChecklist();
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    sections[state.step].querySelector('.form-section__title')?.focus({ preventScroll: true });
  }
}

function markStepErrors(errors) {
  const withErrors = new Set(Object.keys(errors).map((f) => FIELD_STEP[f]).filter((s) => s !== undefined));
  stepper.querySelectorAll('.step').forEach((b, i) => b.classList.toggle('has-error', withErrors.has(i)));
  return withErrors.size ? Math.min(...withErrors) : null;
}

/* ------------------------------------------------------------ Opções */

function fillOptions() {
  const { types, cities, features } = state.catalogs;
  form.property_type_id.innerHTML = '<option value="">Selecione…</option>'
    + types.map((t) => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
  form.city_id.innerHTML = '<option value="">Selecione…</option>'
    + cities.map((c) => `<option value="${c.id}" data-state="${escapeHTML(c.state)}">${escapeHTML(c.name)} — ${escapeHTML(c.state)}</option>`).join('');
  form.zone.innerHTML = '<option value="">Sem zona</option>'
    + Object.entries(state.catalogs.zones || {}).map(([k, label]) => `<option value="${k}">${escapeHTML(label)}</option>`).join('');
  $('featureGrid').innerHTML = features.length
    ? features.map((f) => `
      <label class="check">
        <input type="checkbox" name="features" value="${f.id}">
        <span class="check__box">${icon('check')}</span>
        <span>${escapeHTML(f.name)}</span>
      </label>`).join('')
    : '<p class="muted">Nenhuma característica cadastrada. Cadastre em <a class="link" href="caracteristicas.html">Características</a>.</p>';
  updateNeighborhoodList();
}

/** Bairro já cadastrado com zona → preenche a zona sozinho. */
function syncZoneFromNeighborhood() {
  const cityId = Number(form.city_id.value);
  const name = form.neighborhood_name.value.trim().toLowerCase();
  const found = state.catalogs.neighborhoods.find((n) => n.city_id === cityId && n.name.toLowerCase() === name);
  if (found && found.zone) form.zone.value = found.zone;
}

function updateNeighborhoodList() {
  const cityId = Number(form.city_id.value);
  const list = state.catalogs.neighborhoods.filter((n) => n.city_id === cityId);
  $('neighborhoodList').innerHTML = list.map((n) => `<option value="${escapeHTML(n.name)}"></option>`).join('');
  const opt = form.city_id.selectedOptions[0];
  $('stateDisplay').value = opt?.dataset.state || '';
  form.neighborhood_name.placeholder = cityId ? (list.length ? 'Escolha ou digite um novo' : 'Digite o bairro') : 'Selecione a cidade primeiro';
}

/* ------------------------------------------------------------ Preenchimento */

function fill(p) {
  form.title.value = p.title || '';
  form.slug.value = p.slug || '';
  [...form.transaction_type].forEach((r) => { r.checked = r.value === (p.transaction_type || 'venda'); });
  form.property_type_id.value = p.property_type_id || '';
  form.description.value = p.description || '';
  form.zip_code.value = p.zip_code || '';
  form.city_id.value = p.city_id || '';
  updateNeighborhoodList();
  form.neighborhood_name.value = p.neighborhood || '';
  form.zone.value = p.zone || '';
  form.address.value = p.address || '';
  form.number.value = p.number || '';
  form.complement.value = p.complement || '';
  form.show_address.checked = Boolean(p.show_address);
  form.price_from.checked = Boolean(p.price_from);
  MONEY.forEach((f) => { form[f].value = formatMoney(p[f]); });
  DECIMAL.forEach((f) => { form[f].value = formatDecimal(p[f]); });
  COUNTERS.forEach((f) => { form[f].value = p[f] ?? 0; });
  const selected = new Set((p.features || []).map((f) => f.id));
  form.querySelectorAll('input[name="features"]').forEach((c) => { c.checked = selected.has(Number(c.value)); });
  form.status.value = p.published ? p.status : 'disponivel';
  form.featured.checked = Boolean(p.featured);
  state.slugTouched = Boolean(p.published);
  updateCounter();
}

function collect(action) {
  return {
    id: state.id || undefined,
    action,
    title: form.title.value.trim(),
    slug: form.slug.value.trim(),
    transaction_type: form.transaction_type.value,
    property_type_id: form.property_type_id.value || null,
    description: form.description.value,
    zip_code: form.zip_code.value,
    city_id: form.city_id.value || null,
    neighborhood_name: form.neighborhood_name.value.trim(),
    zone: form.zone.value || null,
    address: form.address.value.trim(),
    number: form.number.value.trim(),
    complement: form.complement.value.trim(),
    show_address: form.show_address.checked,
    price_from: form.price_from.checked,
    ...Object.fromEntries(MONEY.map((f) => [f, parseMoney(form[f].value)])),
    ...Object.fromEntries(DECIMAL.map((f) => [f, parseDecimal(form[f].value)])),
    ...Object.fromEntries(COUNTERS.map((f) => [f, Number(form[f].value) || 0])),
    features: [...form.querySelectorAll('input[name="features"]:checked')].map((c) => Number(c.value)),
    status: form.status.value,
    featured: form.featured.checked,
  };
}

/* ------------------------------------------------------------ Validação no navegador */

function validate(data, publish) {
  const errors = {};
  if (!data.title) errors.title = 'Informe o título do imóvel.';
  else if (data.title.length < 3) errors.title = 'O título precisa ter pelo menos 3 caracteres.';
  if (data.zip_code && data.zip_code.replace(/\D/g, '').length !== 8) errors.zip_code = 'CEP deve ter 8 dígitos.';
  if (data.suites > data.bedrooms) errors.suites = 'Suítes não pode ser maior que o número de quartos.';
  if (publish) {
    if (!data.property_type_id) errors.property_type_id = 'Tipo do imóvel é obrigatório para publicar.';
    if (!data.price) errors.price = 'Preço é obrigatório para publicar.';
    if (!data.city_id) errors.city_id = 'Cidade é obrigatória para publicar.';
    if (!data.neighborhood_name) errors.neighborhood_name = 'Bairro é obrigatório para publicar.';
  }
  return errors;
}

function showErrors(errors) {
  const first = markStepErrors(errors);
  if (first !== null && first !== state.step) goTo(first, false);
  showFieldErrors(form, errors);
}

/* ------------------------------------------------------------ Salvar */

async function save(action, { silent = false, button = null } = {}) {
  if (state.saving) return null;
  const data = collect(action);
  const errors = validate(data, action === 'publish');
  clearFieldErrors(form);
  markStepErrors({});
  if (Object.keys(errors).length) {
    if (!silent) {
      showErrors(errors);
      toast(action === 'publish' ? 'Preencha os campos obrigatórios para publicar.' : 'Verifique os campos destacados.', 'error');
    }
    return null;
  }

  state.saving = true;
  setSaveStatus('saving');
  if (button) setLoading(button, true);
  try {
    const res = state.id
      ? await api.post('properties/update.php', data)
      : await api.post('properties/create.php', data);
    const isNew = !state.id;
    state.property = res.data;
    state.id = res.data.id;
    state.dirty = false;
    state.lastSaved = new Date();
    if (isNew) history.replaceState(null, '', `imovel-form.html?id=${state.id}`);
    form.slug.value = res.data.slug;
    afterSave();
    if (!silent) toast(res.message);
    return res.data;
  } catch (err) {
    setSaveStatus('dirty');
    if (err.status === 401) return null;
    if (err.status === 422 && Object.keys(err.errors || {}).length) {
      if (!silent) { showErrors(err.errors); toast(err.message, 'error'); }
    } else if (!silent) {
      toast(err.message || 'Erro ao salvar imóvel.', 'error');
    }
    return null;
  } finally {
    state.saving = false;
    if (button) setLoading(button, false);
  }
}

function afterSave() {
  const p = state.property;
  document.title = `${p.title} — Painel Rivaldo`;
  $('pageTitle').textContent = p.title;
  $('pageSubtitle').textContent = `${p.code} · ${p.published ? 'publicado no site' : 'rascunho (não aparece no site)'}`;
  $('metaCode').textContent = p.code;
  $('metaStatus').textContent = statusLabel();
  $('codeDisplay').value = p.code;
  updateButtons();
  updateGalleryLock();
  setSaveStatus('saved');
  updateChecklist();
}

function updateButtons() {
  const published = Boolean(state.property?.published);
  $('saveDraft').hidden = published;
  $('publishBtn').querySelector('span').textContent = published ? 'Salvar alterações' : 'Publicar imóvel';
  $('unpublishWrap').hidden = !published;
  const view = $('viewSite');
  view.hidden = !published;
  if (published) view.href = `../imovel.html?id=${state.id}`;
  $('statusField').hidden = false;
  $('publishState').innerHTML = published
    ? `${icon('globe')} Publicado no site desde ${escapeHTML(new Date(state.property.published_at.replace(' ', 'T')).toLocaleDateString('pt-BR'))}.`
    : `${icon('eyeOff')} Ainda não publicado. Ao publicar, o imóvel aparece no site com o status escolhido.`;
}

function setSaveStatus(kind) {
  const el = $('saveStatus');
  el.classList.toggle('is-dirty', kind === 'dirty');
  if (kind === 'saving') el.innerHTML = `${icon('refresh')} Salvando…`;
  else if (kind === 'dirty') el.innerHTML = `${icon('clock')} Alterações não salvas`;
  else if (kind === 'saved' && state.lastSaved) {
    el.innerHTML = `${icon('check')} Salvo às ${state.lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } else el.innerHTML = '';
}

/* ------------------------------------------------------------ Galeria */

function updateGalleryLock() {
  $('galleryLocked').hidden = Boolean(state.id);
}

async function ensureSaved() {
  if (state.id) return state.id;
  if (!form.title.value.trim()) {
    toast('Informe o título do imóvel antes de adicionar fotos.', 'info');
    goTo(0);
    form.title.focus();
    return null;
  }
  const saved = await save('draft', { silent: false });
  return saved?.id || null;
}

/* ------------------------------------------------------------ Checklist de publicação */

function updateChecklist() {
  const d = collect('publish');
  const items = [
    ['Título', Boolean(d.title && d.title.length >= 3)],
    ['Tipo de negociação e tipo do imóvel', Boolean(d.transaction_type && d.property_type_id)],
    ['Preço', Boolean(d.price)],
    ['Cidade e bairro', Boolean(d.city_id && d.neighborhood_name)],
    ['Pelo menos 1 foto (recomendado)', (gallery?.images.length || 0) > 0],
    ['Descrição (recomendado)', d.description.trim().length >= 40],
  ];
  $('publishChecklist').innerHTML = items.map(([label, ok]) =>
    `<li class="${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'clock')}<span>${label}</span></li>`).join('');
  STEPS.forEach((_, i) => {
    const btn = stepper.querySelector(`[data-step="${i}"]`);
    if (!btn) return;
    const done = [items[0][1] && items[1][1], items[3][1], items[2][1], true, items[4][1], Boolean(state.property?.published)][i];
    btn.classList.toggle('is-done', Boolean(done) && i !== state.step);
  });
}

/* ------------------------------------------------------------ Campos especiais */

function slugify(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
}

function updateCounter() {
  $('descCounter').textContent = `${form.description.value.length.toLocaleString('pt-BR')} / 20.000`;
}

async function lookupCep() {
  const cep = form.zip_code.value.replace(/\D/g, '');
  if (cep.length !== 8) return;
  const btn = $('cepBtn');
  setLoading(btn, true);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: 'force-cache' });
    const data = await res.json();
    if (data.erro) { toast('CEP não encontrado.', 'info'); return; }
    if (data.logradouro && !form.address.value) form.address.value = data.logradouro;
    const city = state.catalogs.cities.find((c) => slugify(c.name) === slugify(data.localidade || '') && c.state === data.uf);
    if (city) {
      form.city_id.value = city.id;
      updateNeighborhoodList();
      if (data.bairro && !form.neighborhood_name.value) form.neighborhood_name.value = data.bairro;
      syncZoneFromNeighborhood();
      toast('Endereço preenchido pelo CEP.');
    } else {
      if (data.bairro && !form.neighborhood_name.value) form.neighborhood_name.value = data.bairro;
      toast(`A cidade ${data.localidade}/${data.uf} ainda não está cadastrada. Cadastre em Bairros / localidades.`, 'info', { duration: 7000 });
    }
    markDirty();
  } catch {
    toast('Não foi possível consultar o CEP agora. Preencha manualmente.', 'info');
  } finally {
    setLoading(btn, false);
  }
}

function markDirty() {
  state.dirty = true;
  setSaveStatus('dirty');
}

function bind() {
  stepper.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (b) goTo(Number(b.dataset.step));
  });
  $('prevStep').addEventListener('click', () => goTo(state.step - 1));
  $('nextStep').addEventListener('click', () => goTo(state.step + 1));

  form.addEventListener('input', (e) => {
    markDirty();
    if (e.target.name === 'title' && !state.slugTouched) form.slug.value = slugify(form.title.value);
    if (e.target.name === 'slug') state.slugTouched = true;
    if (e.target.name === 'description') updateCounter();
    if (e.target.name === 'neighborhood_name') syncZoneFromNeighborhood();
    if (e.target.closest('.form-field.has-error')) {
      const field = e.target.closest('.form-field');
      field.classList.remove('has-error');
      field.querySelector('.form-error')?.remove();
      e.target.removeAttribute('aria-invalid');
    }
  });
  form.addEventListener('change', (e) => {
    markDirty();
    if (e.target.name === 'city_id') { form.neighborhood_name.value = ''; form.zone.value = ''; updateNeighborhoodList(); }
    if (e.target.name === 'neighborhood_name') syncZoneFromNeighborhood();
    if (state.step === 5) updateChecklist();
  });

  MONEY.forEach((f) => moneyInput(form[f]));
  form.zip_code.addEventListener('input', () => {
    const d = form.zip_code.value.replace(/\D/g, '').slice(0, 8);
    form.zip_code.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    if (d.length === 8) lookupCep();
  });
  $('cepBtn').addEventListener('click', lookupCep);

  form.querySelectorAll('.counter').forEach((c) => {
    const input = c.querySelector('input');
    c.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      input.value = Math.max(0, Math.min(99, (Number(input.value) || 0) + Number(b.dataset.delta)));
      markDirty();
    }));
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); save('publish', { button: $('publishBtn') }); });
  $('saveDraft').addEventListener('click', () => save('draft', { button: $('saveDraft') }));
  $('unpublishBtn').addEventListener('click', async () => {
    const saved = await save('draft', { button: $('unpublishBtn') });
    if (saved) toast('Imóvel despublicado: voltou para rascunho e saiu do site.', 'info');
  });

  // Ctrl/Cmd + S salva
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (state.property?.published) save('publish', { button: $('publishBtn') });
      else save('draft', { button: $('saveDraft') });
    }
  });

  guardUnsaved(() => state.dirty);

  // Autosave apenas para rascunhos (um imóvel publicado nunca é alterado sem clique)
  setInterval(() => {
    if (state.dirty && !state.saving && !state.property?.published && form.title.value.trim().length >= 3) {
      save('draft', { silent: true });
    }
  }, AUTOSAVE_MS);
}

/* ------------------------------------------------------------ Início */

(async () => {
  try {
    await initLayout({
      page: state.id ? 'properties' : 'property-new',
      title: state.id ? 'Editar imóvel' : 'Adicionar imóvel',
      crumb: 'Imóveis',
    });
  } catch {
    return;
  }

  renderStepper();
  try {
    const [cat, prop] = await Promise.all([
      api.get('catalogs/index.php'),
      state.id ? api.get('properties/show.php', { id: state.id }) : Promise.resolve(null),
    ]);
    state.catalogs = cat.data;
    fillOptions();
    gallery = new Gallery($('gallery'), {
      getPropertyId: () => state.id,
      ensureSaved,
      onChange: () => { if (state.step === 5) updateChecklist(); },
    });
    if (prop) {
      state.property = prop.data;
      fill(prop.data);
      gallery.setImages(prop.data.images, prop.data.cover_image_id);
      afterSave();
      setSaveStatus('');
    } else {
      gallery.setImages([], null);
      updateButtons();
      $('unpublishWrap').hidden = true;
      updateCounter();
    }
  } catch (err) {
    if (err.status === 404) {
      toast('Imóvel não encontrado.', 'error');
      setTimeout(() => window.location.replace('imoveis.html'), 1200);
      return;
    }
    if (err.status !== 401) toast(err.message, 'error');
    return;
  }

  updateGalleryLock();
  renderStepper();
  bind();
  goTo(0, false);
  updateChecklist();
  if (!state.id) form.title.focus();
})();
