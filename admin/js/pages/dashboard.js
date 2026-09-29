/**
 * Dashboard: resumo numérico + imóveis cadastrados recentemente.
 */
import { api } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { escapeHTML, formatDate, formatPrice, statusBadge, firstName, todayLong } from '../core/format.js';

const STATS = [
  { key: 'total',     label: 'Total de imóveis',   icon: 'building', hint: 'Sem contar excluídos', primary: true },
  { key: 'available', label: 'Disponíveis',        icon: 'key',      hint: 'Visíveis para clientes' },
  { key: 'sold',      label: 'Vendidos',           icon: 'check',    hint: 'Negócios concluídos' },
  { key: 'rented',    label: 'Alugados',           icon: 'home',     hint: 'Contratos ativos' },
  { key: 'featured',  label: 'Em destaque',        icon: 'star',     hint: 'No carrossel da Home' },
  { key: 'recent',    label: 'Novos (30 dias)',    icon: 'sparkle',  hint: 'Cadastrados no mês' },
];

const statsEl = document.getElementById('stats');
const recentEl = document.getElementById('recent');

function renderStatsSkeleton() {
  statsEl.innerHTML = STATS.map((s, i) => `
    <div class="stat" style="--i:${i}">
      <div class="stat__top"><span class="skeleton" style="width:60%;height:14px"></span></div>
      <span class="skeleton" style="width:40%;height:30px"></span>
    </div>`).join('');
}

function renderStats(counts) {
  statsEl.innerHTML = STATS.map((s, i) => `
    <article class="stat${s.primary ? ' stat--primary' : ''}" style="--i:${i}">
      <div class="stat__top">
        <h3 class="stat__label">${s.label}</h3>
        <span class="stat__icon">${icon(s.icon)}</span>
      </div>
      <p class="stat__value">${Number(counts[s.key] || 0).toLocaleString('pt-BR')}</p>
      <p class="stat__hint">${s.hint}</p>
    </article>`).join('');
  statsEl.removeAttribute('aria-busy');

  if (counts.drafts > 0) {
    statsEl.insertAdjacentHTML('afterend',
      `<p class="notice notice--info">${counts.drafts === 1 ? 'Há 1 imóvel' : `Há ${counts.drafts} imóveis`} em rascunho, ainda não publicado${counts.drafts === 1 ? '' : 's'} no site.</p>`);
  }
}

function renderRecentSkeleton() {
  recentEl.innerHTML = `<div class="card__body">${Array.from({ length: 4 }, () => `
    <div style="display:flex;gap:1rem;align-items:center;padding:.6rem 0">
      <span class="skeleton" style="width:64px;height:48px"></span>
      <div style="flex:1"><span class="skeleton" style="width:45%;height:14px;margin-bottom:.5rem"></span>
      <span class="skeleton" style="width:25%;height:12px"></span></div>
    </div>`).join('')}</div>`;
}

function renderRecent(items) {
  recentEl.removeAttribute('aria-busy');

  if (!items.length) {
    recentEl.innerHTML = `
      <div class="empty">
        <span class="empty__icon">${icon('home')}</span>
        <p class="empty__title">Nenhum imóvel cadastrado ainda.</p>
        <p class="empty__text">Quando você cadastrar imóveis, os mais recentes aparecem aqui.</p>
        <a class="btn btn--gold" href="imovel-form.html">${icon('plus')}<span>Adicionar primeiro imóvel</span></a>
      </div>`;
    return;
  }

  const rows = items.map((p) => {
    const location = [p.neighborhood?.name, p.city?.name].filter(Boolean).join(' — ');
    const thumb = p.cover
      ? `<img class="thumb" src="../${escapeHTML(p.cover.sm)}" alt="" loading="lazy" width="64" height="48">`
      : `<span class="thumb" aria-hidden="true"></span>`;
    return `
      <tr>
        <td class="cell-main">
          <div class="prop-cell">
            ${thumb}
            <div>
              <p class="prop-cell__title"><a href="imovel-form.html?id=${p.id}">${escapeHTML(p.title)}</a></p>
              <p class="prop-cell__meta">${escapeHTML(p.code || '')}${location ? ` · ${escapeHTML(location)}` : ''}</p>
            </div>
          </div>
        </td>
        <td data-label="Status">${statusBadge(p.status)}</td>
        <td data-label="Preço" class="num nowrap">${escapeHTML(formatPrice(p.price, p.transaction_type))}</td>
        <td data-label="Cadastro" class="nowrap muted">${escapeHTML(formatDate(p.created_at))}</td>
      </tr>`;
  }).join('');

  recentEl.innerHTML = `
    <div class="table-wrap">
      <table class="table table--cards">
        <thead><tr><th scope="col">Imóvel</th><th scope="col">Status</th><th scope="col">Preço</th><th scope="col">Cadastro</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function loadDashboard() {
  renderStatsSkeleton();
  renderRecentSkeleton();
  try {
    const { data } = await api.get('dashboard/stats.php');
    renderStats(data.counts);
    renderRecent(data.recent);
  } catch (err) {
    if (err.status === 401) return;
    statsEl.innerHTML = '';
    recentEl.innerHTML = `
      <div class="empty">
        <span class="empty__icon">${icon('alert')}</span>
        <p class="empty__title">Não foi possível carregar os dados.</p>
        <p class="empty__text">${escapeHTML(err.message)}</p>
        <button class="btn btn--outline" type="button" id="retry">Tentar novamente</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', loadDashboard);
    toast(err.message, 'error');
  }
}

(async () => {
  let user;
  try {
    ({ user } = await initLayout({ page: 'dashboard', title: 'Dashboard', crumb: 'Visão geral' }));
  } catch {
    return; // sem sessão → api.js já redirecionou para o login
  }
  document.getElementById('today').textContent = todayLong();
  document.getElementById('greeting').textContent = `Olá, ${firstName(user.name)}`;
  loadDashboard();
})();
