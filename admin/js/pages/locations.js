/**
 * Bairros / localidades: cidades (com UF) à esquerda, bairros da cidade à direita.
 */
import { api } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, formModal, actionMenu, emptyState } from '../core/ui.js';
import { escapeHTML } from '../core/format.js';

const citiesEl = document.getElementById('cities');
const hoodsEl = document.getElementById('neighborhoods');
const hoodsTitle = document.getElementById('hoodsTitle');
const newHoodBtn = document.getElementById('newHood');

let data = { cities: [], neighborhoods: [], states: [], zones: {} };
let selectedCity = null;
let user;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const zoneLabel = (z) => (z && data.zones[z]) || '';

function renderCities() {
  citiesEl.removeAttribute('aria-busy');
  if (!data.cities.length) {
    citiesEl.innerHTML = emptyState({ iconName: 'pin', title: 'Nenhuma cidade cadastrada.',
      action: `<button class="btn btn--gold" type="button" data-new-city>${icon('plus')}<span>Nova cidade</span></button>` });
    return;
  }
  citiesEl.innerHTML = `<div class="list-rows city-list">${data.cities.map((c) => `
    <div class="list-row${c.active ? '' : ' is-inactive'}" data-city="${c.id}" tabindex="0" role="button"
         aria-current="${c.id === selectedCity}" aria-label="Ver bairros de ${escapeHTML(c.name)}">
      <div>
        <p class="list-row__title">${escapeHTML(c.name)} <span class="subtle">— ${escapeHTML(c.state)}</span></p>
        <p class="list-row__meta">${plural(c.neighborhoods_count, 'bairro', 'bairros')} · ${plural(c.properties_count, 'imóvel', 'imóveis')}</p>
      </div>
      <button class="icon-btn" type="button" data-city-menu aria-haspopup="menu" aria-expanded="false" aria-label="Ações para ${escapeHTML(c.name)}">${icon('dots')}</button>
    </div>`).join('')}</div>`;
}

function renderHoods() {
  hoodsEl.removeAttribute('aria-busy');
  const city = data.cities.find((c) => c.id === selectedCity);
  newHoodBtn.disabled = !city;
  if (!city) {
    hoodsTitle.textContent = 'Bairros';
    hoodsEl.innerHTML = emptyState({ iconName: 'pin', title: 'Selecione uma cidade', text: 'Os bairros da cidade escolhida aparecem aqui.' });
    return;
  }
  hoodsTitle.textContent = `Bairros de ${city.name}`;
  const list = data.neighborhoods.filter((n) => n.city_id === city.id);
  if (!list.length) {
    hoodsEl.innerHTML = emptyState({ iconName: 'pin', title: 'Nenhum bairro nesta cidade.',
      text: 'Bairros também são criados automaticamente quando você digita um novo no cadastro do imóvel.',
      action: `<button class="btn btn--outline" type="button" data-new-hood>${icon('plus')}<span>Novo bairro</span></button>` });
    return;
  }
  hoodsEl.innerHTML = `<div class="list-rows">${list.map((n) => `
    <div class="list-row${n.active ? '' : ' is-inactive'}" data-hood="${n.id}">
      <div>
        <p class="list-row__title">${escapeHTML(n.name)}</p>
        <p class="list-row__meta">${zoneLabel(n.zone) ? `${escapeHTML(zoneLabel(n.zone))} · ` : ''}${plural(n.properties_count, 'imóvel', 'imóveis')}</p>
      </div>
      ${n.active ? '<span class="badge badge--disponivel">Ativo</span>' : '<span class="badge badge--indisponivel">Inativo</span>'}
      <button class="icon-btn" type="button" data-hood-menu aria-haspopup="menu" aria-expanded="false" aria-label="Ações para ${escapeHTML(n.name)}">${icon('dots')}</button>
    </div>`).join('')}</div>`;
}

async function load() {
  try {
    ({ data } = await api.get('locations/index.php'));
    if (!data.cities.some((c) => c.id === selectedCity)) {
      // Abre em São Paulo (onde ficam as zonas); senão, na primeira cidade
      selectedCity = (data.cities.find((c) => c.slug === 'sao-paulo-sp') || data.cities[0])?.id ?? null;
    }
    renderCities();
    renderHoods();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

function activeSwitch(checked, text) {
  return `
    <div class="form-field">
      <label class="switch">
        <input type="checkbox" name="active" ${checked ? 'checked' : ''}>
        <span class="switch__track"></span>
        <span class="switch__label">Ativo<span class="switch__text">${text}</span></span>
      </label>
    </div>`;
}

function cityForm(city = null) {
  formModal({
    title: city ? 'Editar cidade' : 'Nova cidade',
    submitText: city ? 'Salvar alterações' : 'Cadastrar cidade',
    body: `
      <div class="form-grid">
        <div class="form-field span-4">
          <label for="cName">Cidade<span class="req">*</span></label>
          <input class="input" id="cName" name="name" maxlength="120" required value="${escapeHTML(city?.name || '')}" placeholder="Ex.: Santos">
        </div>
        <div class="form-field span-2 keep-half">
          <label for="cState">UF<span class="req">*</span></label>
          <select class="select" id="cState" name="state" required>
            <option value="">UF</option>
            ${data.states.map((s) => `<option ${(city?.state || 'SP') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      ${activeSwitch(!city || city.active, 'Cidades inativas não aparecem no formulário nem nos filtros do site.')}`,
    onSubmit: async (form, close) => {
      const res = await api.post('locations/save-city.php', { id: city?.id, name: form.name.value.trim(), state: form.state.value, active: form.active.checked });
      toast(res.message);
      if (!city) selectedCity = res.data.id;
      close();
      load();
    },
  });
}

function hoodForm(hood = null) {
  formModal({
    title: hood ? 'Editar bairro' : 'Novo bairro',
    submitText: hood ? 'Salvar alterações' : 'Cadastrar bairro',
    body: `
      <div class="form-field">
        <label for="hCity">Cidade<span class="req">*</span></label>
        <select class="select" id="hCity" name="city_id" required>
          ${data.cities.map((c) => `<option value="${c.id}" ${(hood?.city_id ?? selectedCity) === c.id ? 'selected' : ''}>${escapeHTML(c.name)} — ${c.state}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="hName">Bairro<span class="req">*</span></label>
        <input class="input" id="hName" name="name" maxlength="120" required value="${escapeHTML(hood?.name || '')}" placeholder="Ex.: Moema">
      </div>
      <div class="form-field">
        <label for="hZone">Zona</label>
        <select class="select" id="hZone" name="zone">
          <option value="">Sem zona</option>
          ${Object.entries(data.zones).map(([k, label]) => `<option value="${k}" ${hood?.zone === k ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}
        </select>
        <p class="form-hint">Usada no filtro “Zona” do site (São Paulo).</p>
      </div>
      ${activeSwitch(!hood || hood.active, 'Bairros inativos não aparecem nas sugestões nem nos filtros do site.')}`,
    onSubmit: async (form, close) => {
      const res = await api.post('locations/save-neighborhood.php', { id: hood?.id, city_id: Number(form.city_id.value), name: form.name.value.trim(), zone: form.zone.value || null, active: form.active.checked });
      toast(res.message);
      selectedCity = Number(form.city_id.value);
      close();
      load();
    },
  });
}

async function remove(kind, item) {
  const isCity = kind === 'city';
  const ok = await confirmDialog({ title: isCity ? 'Excluir cidade?' : 'Excluir bairro?', text: `"${item.name}" será removido permanentemente.`, confirmText: 'Excluir', danger: true });
  if (!ok) return;
  try {
    const res = await api.post(isCity ? 'locations/delete-city.php' : 'locations/delete-neighborhood.php', { id: item.id });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function toggle(kind, item) {
  try {
    const res = kind === 'city'
      ? await api.post('locations/save-city.php', { id: item.id, name: item.name, state: item.state, active: !item.active })
      : await api.post('locations/save-neighborhood.php', { id: item.id, city_id: item.city_id, name: item.name, zone: item.zone, active: !item.active });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-new-city], #newCity')) { cityForm(); return; }
  if (e.target.closest('[data-new-hood], #newHood')) { hoodForm(); return; }

  const cityRow = e.target.closest('[data-city]');
  if (cityRow) {
    const city = data.cities.find((c) => c.id === Number(cityRow.dataset.city));
    const menuBtn = e.target.closest('[data-city-menu]');
    if (menuBtn) {
      actionMenu(menuBtn, [
        { label: 'Editar cidade', icon: 'edit', onClick: () => cityForm(city) },
        { label: city.active ? 'Desativar' : 'Ativar', icon: city.active ? 'eyeOff' : 'eye', onClick: () => toggle('city', city) },
        { label: 'Excluir', icon: 'trash', danger: true, hidden: user.role !== 'admin', onClick: () => remove('city', city) },
      ]);
      return;
    }
    selectedCity = city.id;
    renderCities();
    renderHoods();
    return;
  }

  const hoodRow = e.target.closest('[data-hood]');
  const hoodMenu = e.target.closest('[data-hood-menu]');
  if (hoodRow && hoodMenu) {
    const hood = data.neighborhoods.find((n) => n.id === Number(hoodRow.dataset.hood));
    actionMenu(hoodMenu, [
      { label: 'Editar bairro', icon: 'edit', onClick: () => hoodForm(hood) },
      { label: hood.active ? 'Desativar' : 'Ativar', icon: hood.active ? 'eyeOff' : 'eye', onClick: () => toggle('hood', hood) },
      { label: 'Excluir', icon: 'trash', danger: true, hidden: user.role !== 'admin', onClick: () => remove('hood', hood) },
    ]);
  }
});

citiesEl.addEventListener('keydown', (e) => {
  const row = e.target.closest('[data-city]');
  if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); row.click(); }
});

(async () => {
  try {
    ({ user } = await initLayout({ page: 'locations', title: 'Bairros / localidades', crumb: 'Cidades e bairros' }));
  } catch {
    return;
  }
  load();
})();
