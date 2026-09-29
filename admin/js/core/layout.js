/**
 * Estrutura comum das páginas do painel: verificação de sessão, sidebar,
 * topbar, menu do usuário, logout e botão "Instalar app" (PWA).
 *
 * Uso em cada página:
 *   const { user } = await initLayout({ page: 'dashboard', title: 'Dashboard' });
 */
import { api, setCsrfToken, redirectToLogin } from './api.js';
import { injectIcons, icon } from './icons.js';
import { escapeHTML, initials, ROLES } from './format.js';
import { setLoading } from './ui.js';
import { registerServiceWorker, onInstallAvailable, promptInstall } from './pwa.js';

/**
 * Menu lateral — fonte única para todas as páginas.
 * roles: quem vê o item (o SERVIDOR também bloqueia; isto é só interface).
 */
const NAV = [
  { section: 'Principal' },
  { id: 'dashboard',    label: 'Dashboard',             href: 'index.html',               icon: 'grid' },
  { id: 'properties',   label: 'Imóveis',               href: 'imoveis.html',             icon: 'home' },
  { id: 'property-new', label: 'Adicionar imóvel',      href: 'imovel-form.html',         icon: 'plus' },
  { id: 'featured',     label: 'Destaques',             href: 'imoveis.html?destaque=1',  icon: 'star' },
  { section: 'Cadastros' },
  { id: 'categories',   label: 'Categorias',            href: 'categorias.html',          icon: 'tag' },
  { id: 'locations',    label: 'Bairros / localidades', href: 'localidades.html',         icon: 'pin' },
  { id: 'features',     label: 'Características',       href: 'caracteristicas.html',     icon: 'checklist' },
  { section: 'Sistema', roles: ['admin'] },
  { id: 'settings',     label: 'Configurações do site', href: 'configuracoes.html',       icon: 'settings', roles: ['admin'] },
  { id: 'users',        label: 'Usuários',              href: 'usuarios.html',            icon: 'users',    provider: true },
  { section: 'Conta' },
  { id: 'profile',      label: 'Meu perfil',            href: 'perfil.html',              icon: 'user' },
];

let currentUser = null;

/** Como a pessoa entra: nome de usuário (ou e-mail). */
export const loginLabel = (user) => user?.username || user?.email || '';

export function getUser() {
  return currentUser;
}

export function setUser(user) {
  currentUser = { ...currentUser, ...user };
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = currentUser.name; });
  document.querySelectorAll('[data-user-email]').forEach((el) => { el.textContent = loginLabel(currentUser); });
  document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = initials(currentUser.name); });
}

/** Confirma a sessão no servidor. Sem sessão → login. */
export async function requireAuth() {
  const res = await api.get('auth/me.php');
  setCsrfToken(res.data.csrf_token);
  currentUser = res.data.user;
  return currentUser;
}

export async function logout(button) {
  setLoading(button, true, 'Saindo…');
  try {
    await api.post('auth/logout.php', {});
  } catch {
    /* mesmo com erro de rede, a navegação abaixo encerra o acesso local */
  }
  setCsrfToken(null);
  window.location.replace('login.html?motivo=saiu');
}

function navItems(user, page) {
  return NAV.filter((item) => (!item.roles || item.roles.includes(user.role)) && (!item.provider || user.is_provider))
    .map((item) => {
      if (item.section) return `<p class="nav-section">${escapeHTML(item.section)}</p>`;
      const current = item.id === page ? ' aria-current="page"' : '';
      return `<a class="nav-link" href="${item.href}"${current}>${icon(item.icon)}<span>${escapeHTML(item.label)}</span></a>`;
    })
    .join('');
}

function renderSidebar(user, page) {
  document.getElementById('sidebar').innerHTML = `
    <a class="sidebar__brand" href="index.html" aria-label="Rivaldo Duarte — Dashboard">
      <img class="brand-logo brand-logo--sidebar" src="../assets/images/logo-assinatura.webp" alt="" width="931" height="140" decoding="async">
      <span class="sidebar__tag">Painel administrativo</span>
    </a>
    <nav class="sidebar__nav" aria-label="Menu do painel">${navItems(user, page)}</nav>
    <div class="sidebar__footer">
      <button class="nav-link nav-link--install" type="button" id="installApp" hidden>
        ${icon('download')}<span>Instalar aplicativo</span>
      </button>
      <a class="user-card" href="perfil.html">
        <span class="avatar" aria-hidden="true" data-user-initials>${escapeHTML(initials(user.name))}</span>
        <div>
          <p class="user-card__name" data-user-name>${escapeHTML(user.name)}</p>
          <p class="user-card__role">${escapeHTML(ROLES[user.role] || user.role)}</p>
        </div>
      </a>
      <button class="nav-link" type="button" data-logout>${icon('logout')}<span>Sair</span></button>
    </div>`;
}

function renderTopbar(user, title, crumb) {
  document.getElementById('topbar').innerHTML = `
    <button class="btn btn--ghost btn--icon topbar__menu" type="button" id="menuToggle"
            aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
    <div class="topbar__heading">
      <p class="topbar__title">${escapeHTML(title)}</p>
      ${crumb ? `<p class="topbar__crumb">${escapeHTML(crumb)}</p>` : ''}
    </div>
    <div class="topbar__actions">
      <a class="btn btn--ghost btn--sm" href="../index.html" target="_blank" rel="noopener">
        ${icon('external')}<span class="btn-label">Ver site</span>
      </a>
      <div class="dropdown" id="userMenu">
        <button class="dropdown__toggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Menu do usuário">
          <span class="avatar" aria-hidden="true" data-user-initials>${escapeHTML(initials(user.name))}</span>
        </button>
        <div class="dropdown__menu" role="menu">
          <div class="dropdown__header">
            <p class="user-card__name" data-user-name>${escapeHTML(user.name)}</p>
            <p class="user-card__role" data-user-email>${escapeHTML(loginLabel(user))}</p>
          </div>
          <a class="dropdown__item" role="menuitem" href="perfil.html">${icon('user')}Meu perfil</a>
          <button class="dropdown__item dropdown__item--danger" type="button" role="menuitem" data-logout>${icon('logout')}Sair</button>
        </div>
      </div>
    </div>`;
}

function bindShell() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const toggle = document.getElementById('menuToggle');
  const userMenu = document.getElementById('userMenu');
  const userToggle = userMenu.querySelector('.dropdown__toggle');

  const setDrawer = (open) => {
    sidebar.classList.toggle('is-open', open);
    scrim.classList.toggle('is-visible', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.classList.toggle('is-locked', open);
    if (open) sidebar.querySelector('.nav-link')?.focus();
  };
  const setUserMenu = (open) => {
    userMenu.classList.toggle('is-open', open);
    userToggle.setAttribute('aria-expanded', String(open));
    if (open) userMenu.querySelector('.dropdown__item')?.focus();
  };

  toggle.addEventListener('click', () => setDrawer(!sidebar.classList.contains('is-open')));
  scrim.addEventListener('click', () => setDrawer(false));
  userToggle.addEventListener('click', (e) => { e.stopPropagation(); setUserMenu(!userMenu.classList.contains('is-open')); });
  document.addEventListener('click', (e) => { if (!userMenu.contains(e.target)) setUserMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (userMenu.classList.contains('is-open')) { setUserMenu(false); userToggle.focus(); }
    if (sidebar.classList.contains('is-open')) { setDrawer(false); toggle.focus(); }
  });
  window.matchMedia('(min-width: 1025px)').addEventListener('change', (e) => { if (e.matches) setDrawer(false); });

  document.addEventListener('click', (e) => {
    const logoutBtn = e.target.closest('[data-logout]');
    if (logoutBtn) logout(logoutBtn);
  });

  // PWA: botão "Instalar aplicativo" só aparece quando o navegador permite
  const installBtn = document.getElementById('installApp');
  onInstallAvailable((available) => { installBtn.hidden = !available; });
  installBtn.addEventListener('click', promptInstall);
}

/**
 * Inicializa a página protegida. Só revela o conteúdo depois que o
 * servidor confirmar a sessão (evita "piscar" a tela para quem não logou).
 * roles: se informado, quem não tiver o papel volta ao dashboard.
 */
export async function initLayout({ page, title, crumb = '', roles = null, provider = false }) {
  injectIcons();
  registerServiceWorker();
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status !== 401) {
      document.querySelector('.boot')?.insertAdjacentHTML(
        'beforeend',
        `<div class="boot__error"><p>${escapeHTML(err.message)}</p>
         <a class="btn btn--outline btn--sm" href="">Tentar novamente</a></div>`
      );
    }
    throw err;
  }

  // Primeiro acesso: precisa criar a senha pessoal antes de usar o painel.
  if (user.must_change_password) {
    window.location.replace('trocar-senha.html');
    throw new Error('password-change-required');
  }

  if ((roles && !roles.includes(user.role)) || (provider && !user.is_provider)) {
    window.location.replace('index.html');
    throw new Error('forbidden');
  }

  renderSidebar(user, page);
  renderTopbar(user, title, crumb);
  bindShell();
  document.title = `${title} — Painel Rivaldo`;
  document.body.classList.remove('is-booting');
  return { user };
}

export { redirectToLogin };
