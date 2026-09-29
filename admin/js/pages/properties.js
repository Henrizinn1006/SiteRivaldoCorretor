/**
 * Imóveis: listagem com filtros, paginação e ações
 * (editar, visualizar, duplicar, publicar, destaque, status, excluir).
 */
import { api } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, actionMenu, viewModal, debounce, emptyState, renderPagination } from '../core/ui.js';
import { escapeHTML, formatDate, formatPrice, statusBadge, STATUS, TRANSACTION } from '../core/format.js';

const params = new URLSearchParams(window.location.search);
const isFeaturedPage = params.get('destaque') === '1';

const state = {
  q: params.get('q') || '',
  status: params.get('status') || '',
  transaction_type: params.get('negociacao') || '',
  property_type_id: params.get('tipo') || '',
  city_id: params.get('cidade') || '',
  neighborhood_id: params.get('bairro') || '',
  featured: isFeaturedPage ? '1' : (params.get('destaque') || ''),
  sort: params.get('ordem') || 'recent',
  page: Number(params.get('pagina')) || 1,
};
const URL_KEYS = { q: 'q', status: 'status', transaction_type: 'negociacao', property_type_id: 'tipo', city_id: 'cidade', neighborhood_id: 'bairro', featured: 'destaque', sort: 'ordem', page: 'pagina' };

const el = {
  toolbar: document.getElementById('toolbar'),
  q: document.getElementById('fQ'),
  status: document.getElementById('fStatus'),
  transaction: document.getElementById('fTransaction'),
  type: document.getElementById('fType'),
  city: document.getElementById('fCity'),
  neighborhood: document.getElementById('fNeighborhood'),
  featured: document.getElementById('fFeatured'),
  sort: document.getElementById('fSort'),
  summary: document.getElementById('summary'),
  clear: document.getElementById('clearFilters'),
  list: document.getElementById('list'),
  pagination: document.getElementById('pagination'),
  filtersToggle: document.getElementById('filtersToggle'),
};

let catalogs = { types: [], cities: [], neighborhoods: [] };
let current = [];
let requestId = 0;

/* ------------------------------------------------------------ Filtros */

function option(value, label, selected) {
  return `<option value="${escapeHTML(value)}"${String(selected) === String(value) ? ' selected' : ''}>${escapeHTML(label)}</option>`;
}

function fillFilters() {
  el.status.innerHTML = option('', 'Todos os status', state.status)
    + Object.entries(STATUS).map(([v, l]) => option(v, l, state.status)).join('');
  el.transaction.innerHTML = option('', 'Venda e aluguel', state.transaction_type)
    + Object.entries(TRANSACTION).map(([v, l]) => option(v, l, state.transaction_type)).join('');
  el.type.innerHTML = option('', 'Todos os tipos', state.property_type_id)
    + catalogs.types.map((t) => option(t.id, t.name, state.property_type_id)).join('');
  el.city.innerHTML = option('', 'Todas as cidades', state.city_id)
    + catalogs.cities.map((c) => option(c.id, `${c.name} — ${c.state}`, state.city_id)).join('');
  fillNeighborhoods();
  el.featured.innerHTML = option('', 'Destaque: todos', state.featured) + option('1', 'Só destaques', state.featured) + option('0', 'Sem destaque', state.featured);
  el.sort.value = state.sort;
  el.q.value = state.q;
}

function fillNeighborhoods() {
  const list = catalogs.neighborhoods.filter((n) => !state.city_id || String(n.city_id) === String(state.city_id));
  el.neighborhood.innerHTML = option('', 'Todos os bairros', state.neighborhood_id)
    + list.map((n) => option(n.id, n.name, state.neighborhood_id)).join('');
  el.neighborhood.disabled = !list.length;
}

function hasFilters() {
  return Boolean(state.q || state.status || state.transaction_type || state.property_type_id || state.city_id || state.neighborhood_id || (state.featured && !isFeaturedPage));
}

function syncUrl() {
  const p = new URLSearchParams();
  Object.entries(URL_KEYS).forEach(([key, name]) => {
    const v = state[key];
    if (v && !(key === 'sort' && v === 'recent') && !(key === 'page' && v === 1)) p.set(name, v);
  });
  history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
}

function bindFilters() {
  const change = (key, value) => {
    state[key] = value;
    state.page = 1;
    if (key === 'city_id') { state.neighborhood_id = ''; fillNeighborhoods(); }
    load();
  };
  el.q.addEventListener('input', debounce(() => change('q', el.q.value.trim()), 350));
  el.status.addEventListener('change', () => change('status', el.status.value));
  el.transaction.addEventListener('change', () => change('transaction_type', el.transaction.value));
  el.type.addEventListener('change', () => change('property_type_id', el.type.value));
  el.city.addEventListener('change', () => change('city_id', el.city.value));
  el.neighborhood.addEventListener('change', () => change('neighborhood_id', el.neighborhood.value));
  el.featured.addEventListener('change', () => change('featured', el.featured.value));
  el.sort.addEventListener('change', () => change('sort', el.sort.value));
  el.clear.addEventListener('click', () => {
    Object.assign(state, { q: '', status: '', transaction_type: '', property_type_id: '', city_id: '', neighborhood_id: '', featured: isFeaturedPage ? '1' : '', page: 1 });
    fillFilters();
    load();
  });
  el.filtersToggle.addEventListener('click', () => {
    const collapsed = el.toolbar.classList.toggle('is-collapsed');
    el.filtersToggle.setAttribute('aria-expanded', String(!collapsed));
  });
}

/* ------------------------------------------------------------ Listagem */

function renderSkeleton() {
  el.list.setAttribute('aria-busy', 'true');
  el.list.innerHTML = `<div class="card__body">${Array.from({ length: 6 }, () => `
    <div style="display:flex;gap:1rem;align-items:center;padding:.55rem 0">
      <span class="skeleton" style="width:64px;height:48px"></span>
      <div style="flex:1"><span class="skeleton" style="width:40%;height:14px;margin-bottom:.5rem"></span>
      <span class="skeleton" style="width:22%;height:12px"></span></div>
      <span class="skeleton" style="width:90px;height:22px"></span>
    </div>`).join('')}</div>`;
}

function row(p) {
  const location = [p.neighborhood?.name, p.city?.name].filter(Boolean).join(' — ');
  const thumb = p.cover
    ? `<img class="thumb" src="../${escapeHTML(p.cover.sm)}" alt="" loading="lazy" width="64" height="48">`
    : `<span class="thumb" aria-hidden="true"></span>`;
  return `
    <tr data-id="${p.id}">
      <td class="cell-main">
        <div class="prop-cell">
          ${thumb}
          <div>
            <p class="prop-cell__title"><a href="imovel-form.html?id=${p.id}">${escapeHTML(p.title)}</a></p>
            <p class="prop-cell__meta">${escapeHTML(location || 'Sem localização')}${p.images_count ? ` · ${p.images_count} foto${p.images_count > 1 ? 's' : ''}` : ''}</p>
          </div>
        </div>
      </td>
      <td data-label="Código" class="col-code">${escapeHTML(p.code || '—')}</td>
      <td data-label="Tipo">${escapeHTML(p.type?.name || '—')}<br><span class="subtle">${escapeHTML(TRANSACTION[p.transaction_type] || '')}</span></td>
      <td data-label="Preço" class="num nowrap">${escapeHTML(formatPrice(p.price, p.transaction_type))}</td>
      <td data-label="Status">${statusBadge(p.status)}</td>
      <td data-label="Destaque">
        <button class="icon-btn star-toggle" type="button" data-star aria-pressed="${p.featured}"
                aria-label="${p.featured ? 'Remover dos destaques' : 'Marcar como destaque'}" title="${p.featured ? 'Em destaque' : 'Marcar como destaque'}">${icon('star')}</button>
      </td>
      <td data-label="Cadastro" class="nowrap muted col-date">${escapeHTML(formatDate(p.created_at))}</td>
      <td class="cell-actions">
        <div class="row-actions">
          <a class="icon-btn" href="imovel-form.html?id=${p.id}" aria-label="Editar ${escapeHTML(p.title)}" title="Editar">${icon('edit')}</a>
          <button class="icon-btn" type="button" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações para ${escapeHTML(p.title)}">${icon('dots')}</button>
        </div>
      </td>
    </tr>`;
}

function render(data) {
  current = data.items;
  el.list.removeAttribute('aria-busy');
  const { total } = data.meta;
  el.summary.innerHTML = `<b>${total}</b> ${total === 1 ? 'imóvel' : 'imóveis'}${hasFilters() ? ' com os filtros aplicados' : ''}`;
  el.clear.hidden = !hasFilters();

  if (!data.items.length) {
    const firstTime = !hasFilters() && !isFeaturedPage;
    el.list.innerHTML = firstTime
      ? emptyState({ title: 'Nenhum imóvel cadastrado ainda.', text: 'Cadastre o primeiro imóvel para ele aparecer aqui e no site.',
          action: `<a class="btn btn--gold" href="imovel-form.html">${icon('plus')}<span>Adicionar primeiro imóvel</span></a>` })
      : isFeaturedPage && !hasFilters()
        ? emptyState({ iconName: 'star', title: 'Nenhum imóvel em destaque.', text: 'Marque a estrela de um imóvel publicado para ele aparecer no carrossel da Home.',
            action: '<a class="btn btn--outline" href="imoveis.html">Ver todos os imóveis</a>' })
        : emptyState({ iconName: 'search', title: 'Nenhum imóvel encontrado com esses filtros.', text: 'Tente outra busca ou limpe os filtros.',
            action: '<button class="btn btn--outline" type="button" data-clear>Limpar filtros</button>' });
    el.list.querySelector('[data-clear]')?.addEventListener('click', () => el.clear.click());
    el.pagination.innerHTML = '';
    return;
  }

  el.list.innerHTML = `
    <div class="table-wrap">
      <table class="table table--cards table--compact">
        <thead><tr>
          <th scope="col">Imóvel</th><th scope="col">Código</th><th scope="col">Tipo</th><th scope="col">Preço</th>
          <th scope="col">Status</th><th scope="col"><span class="sr-only">Destaque</span>${icon('star')}</th>
          <th scope="col" class="col-date">Cadastro</th><th scope="col"><span class="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>${data.items.map(row).join('')}</tbody>
      </table>
    </div>`;
  renderPagination(el.pagination, data.meta, (page) => { state.page = page; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

async function load() {
  syncUrl();
  const id = ++requestId;
  renderSkeleton();
  try {
    const { data } = await api.get('properties/index.php', {
      q: state.q, status: state.status, transaction_type: state.transaction_type, property_type_id: state.property_type_id,
      city_id: state.city_id, neighborhood_id: state.neighborhood_id, featured: state.featured, sort: state.sort, page: state.page,
    });
    if (id !== requestId) return; // resposta antiga (usuário digitou de novo)
    if (data.items.length === 0 && state.page > 1 && data.meta.total > 0) { state.page = data.meta.pages; load(); return; }
    render(data);
  } catch (err) {
    if (err.status === 401) return;
    el.list.innerHTML = emptyState({ iconName: 'alert', title: 'Não foi possível carregar os imóveis.', text: err.message,
      action: '<button class="btn btn--outline" type="button" data-retry>Tentar novamente</button>' });
    el.list.querySelector('[data-retry]').addEventListener('click', load);
  }
}

/* ------------------------------------------------------------ Ações */

const find = (id) => current.find((p) => p.id === id);

async function runAction(id, action, rowEl) {
  rowEl?.classList.add('is-busy');
  try {
    const res = await api.post('properties/action.php', { id, action });
    toast(res.message);
    await load();
  } catch (err) {
    rowEl?.classList.remove('is-busy');
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function duplicate(p) {
  try {
    const res = await api.post('properties/duplicate.php', { id: p.id });
    toast(res.message);
    window.location.href = `imovel-form.html?id=${res.data.id}`;
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function remove(p, rowEl) {
  const ok = await confirmDialog({
    title: 'Excluir imóvel?',
    text: `Tem certeza que deseja excluir este imóvel? "${p.title}" deixará de aparecer no painel e no site.`,
    confirmText: 'Excluir imóvel',
    danger: true,
  });
  if (!ok) return;
  rowEl?.classList.add('is-busy');
  try {
    const res = await api.post('properties/delete.php', { id: p.id });
    toast(res.message);
    load();
  } catch (err) {
    rowEl?.classList.remove('is-busy');
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function quickView(p) {
  let d;
  try {
    ({ data: d } = await api.get('properties/show.php', { id: p.id }));
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
    return;
  }
  const cover = d.images.find((i) => i.is_cover) || d.images[0];
  const area = d.usable_area || d.total_area;
  const spec = (label, value) => (value || value === 0) ? `<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>` : '';
  viewModal({
    title: d.title,
    body: `
      ${cover ? `<img class="quick-view__cover" src="../${escapeHTML(cover.urls.md)}" alt="">` : '<div class="quick-view__cover"></div>'}
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">
        ${statusBadge(d.status)} ${d.featured ? `<span class="badge badge--vendido">${icon('star')} Destaque</span>` : ''}
        <span class="subtle">${escapeHTML(d.code || '')}</span>
      </div>
      <dl class="quick-view__grid">
        ${spec('Preço', formatPrice(d.price, d.transaction_type))}
        ${spec('Negociação', TRANSACTION[d.transaction_type])}
        ${spec('Tipo', d.type)}
        ${spec('Localização', [d.neighborhood, d.city && `${d.city}/${d.state}`].filter(Boolean).join(', '))}
        ${spec('Área', area ? `${String(area).replace('.', ',')} m²` : '')}
        ${spec('Quartos', d.bedrooms)} ${spec('Suítes', d.suites)} ${spec('Banheiros', d.bathrooms)} ${spec('Vagas', d.parking_spaces)}
        ${spec('Condomínio', d.condominium_fee ? formatPrice(d.condominium_fee) : '')}
        ${spec('IPTU', d.property_tax ? formatPrice(d.property_tax) : '')}
        ${spec('Fotos', d.images.length)}
      </dl>
      ${d.features.length ? `<div class="tag-list">${d.features.map((f) => `<span>${escapeHTML(f.name)}</span>`).join('')}</div>` : ''}
      ${d.description ? `<p class="quick-view__desc">${escapeHTML(d.description)}</p>` : ''}`,
    footer: `
      ${d.published ? `<a class="btn btn--ghost" href="../imovel.html?id=${d.id}" target="_blank" rel="noopener">${icon('globe')}<span>Ver no site</span></a>` : ''}
      <a class="btn btn--gold" href="imovel-form.html?id=${d.id}">${icon('edit')}<span>Editar</span></a>`,
  });
}

function openMenu(trigger, p, rowEl) {
  const statusItem = (action, status, label, iconName) => ({
    label, icon: iconName, hidden: !p.published || p.status === status, onClick: () => runAction(p.id, action, rowEl),
  });
  actionMenu(trigger, [
    { label: 'Editar', icon: 'edit', onClick: () => { window.location.href = `imovel-form.html?id=${p.id}`; } },
    { label: 'Visualizar', icon: 'eye', onClick: () => quickView(p) },
    { label: 'Duplicar', icon: 'copy', onClick: () => duplicate(p) },
    'divider',
    { label: 'Publicar no site', icon: 'send', hidden: p.published, onClick: () => runAction(p.id, 'publish', rowEl) },
    { label: 'Despublicar (rascunho)', icon: 'eyeOff', hidden: !p.published, onClick: () => runAction(p.id, 'unpublish', rowEl) },
    { label: p.featured ? 'Remover destaque' : 'Marcar como destaque', icon: 'star', onClick: () => runAction(p.id, p.featured ? 'unfeature' : 'feature', rowEl) },
    statusItem('mark_available', 'disponivel', 'Marcar como disponível', 'key'),
    statusItem('mark_reserved', 'reservado', 'Marcar como reservado', 'clock'),
    statusItem('mark_sold', 'vendido', 'Marcar como vendido', 'check'),
    statusItem('mark_rented', 'alugado', 'Marcar como alugado', 'home'),
    statusItem('mark_unavailable', 'indisponivel', 'Marcar como indisponível', 'close'),
    'divider',
    { label: 'Excluir', icon: 'trash', danger: true, onClick: () => remove(p, rowEl) },
  ]);
}

el.list.addEventListener('click', (e) => {
  const rowEl = e.target.closest('tr[data-id]');
  if (!rowEl) return;
  const p = find(Number(rowEl.dataset.id));
  if (!p) return;
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) { openMenu(menuBtn, p, rowEl); return; }
  if (e.target.closest('[data-star]')) runAction(p.id, p.featured ? 'unfeature' : 'feature', rowEl);
});

/* ------------------------------------------------------------ Início */

(async () => {
  try {
    await initLayout({
      page: isFeaturedPage ? 'featured' : 'properties',
      title: isFeaturedPage ? 'Destaques' : 'Imóveis',
      crumb: isFeaturedPage ? 'Aparecem no carrossel da Home' : 'Todos os imóveis',
    });
  } catch {
    return;
  }
  if (isFeaturedPage) {
    document.getElementById('pageTitle').textContent = 'Imóveis em destaque';
    document.getElementById('pageSubtitle').textContent = 'Os destaques publicados e disponíveis aparecem automaticamente no carrossel da Home.';
    el.featured.closest('.form-field, select')?.setAttribute('hidden', '');
    el.featured.hidden = true;
  }
  if (window.matchMedia('(max-width: 720px)').matches && !hasFilters()) el.toolbar.classList.add('is-collapsed');
  try {
    const { data } = await api.get('catalogs/index.php');
    catalogs = data;
  } catch { /* filtros de catálogo ficam vazios, a listagem funciona */ }
  fillFilters();
  bindFilters();
  load();
})();
