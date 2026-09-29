/**
 * Componentes de interface reutilizáveis: toast, modal de confirmação,
 * estado de carregamento de botões e exibição de erros de formulário.
 */
import { escapeHTML } from './format.js';
import { icon } from './icons.js';

/* ------------------------------------------------------------------ Toast */

let toastRoot = null;

function ensureToastRoot() {
  if (toastRoot) return toastRoot;
  toastRoot = document.createElement('div');
  toastRoot.className = 'toasts';
  toastRoot.setAttribute('role', 'status');
  toastRoot.setAttribute('aria-live', 'polite');
  document.body.append(toastRoot);
  return toastRoot;
}

const TOAST_ICONS = { success: 'check', error: 'alert', info: 'info' };

/**
 * toast('Imóvel salvo com sucesso.')
 * toast('Erro ao salvar imóvel.', 'error')
 */
export function toast(message, type = 'success', { duration = 4500 } = {}) {
  const root = ensureToastRoot();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  if (type === 'error') el.setAttribute('role', 'alert');
  el.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICONS[type] || 'info')}</span>
    <p class="toast__text">${escapeHTML(message)}</p>
    <button class="toast__close" type="button" aria-label="Fechar aviso">${icon('close')}</button>`;

  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector('.toast__close').addEventListener('click', remove);
  root.append(el);
  if (duration) setTimeout(remove, type === 'error' ? duration * 1.5 : duration);
  return remove;
}

/* ------------------------------------------------------------------ Modal */

/**
 * const ok = await confirmDialog({
 *   title: 'Excluir imóvel?',
 *   text: 'Tem certeza que deseja excluir este imóvel?',
 *   confirmText: 'Excluir',
 *   danger: true,
 * });
 */
export function confirmDialog({
  title = 'Tem certeza?',
  text = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const id = `modal-${Date.now()}`;
    const modal = document.createElement('div');
    modal.className = `modal${danger ? ' modal--danger' : ''}`;
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-d">
        <div class="modal__icon">${icon(danger ? 'trash' : 'info')}</div>
        <h2 class="modal__title" id="${id}-t">${escapeHTML(title)}</h2>
        <p class="modal__text" id="${id}-d">${escapeHTML(text)}</p>
        <div class="modal__actions">
          <button class="btn btn--ghost" type="button" data-close>${escapeHTML(cancelText)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--gold'}" type="button" data-confirm>${escapeHTML(confirmText)}</button>
        </div>
      </div>`;

    const close = (result) => {
      document.removeEventListener('keydown', onKey, true);
      modal.classList.add('is-leaving');
      setTimeout(() => {
        modal.remove();
        document.body.classList.remove('is-locked');
        previousFocus?.focus?.();
      }, 180);
      resolve(result);
    };

    // Mantém o foco dentro do modal (Tab / Shift+Tab) e fecha com Esc
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-confirm]')) close(true);
      else if (e.target.closest('[data-close]')) close(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(modal);
    document.body.classList.add('is-locked');
    // Ações destrutivas começam com foco em "Cancelar"
    modal.querySelector(danger ? '[data-close].btn' : '[data-confirm]').focus();
  });
}

/* ---------------------------------------------------------------- Botões */

/** Mostra spinner, desabilita e evita cliques duplos. */
export function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label ??= button.getAttribute('aria-label') || '';
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    if (label) button.setAttribute('aria-label', label);
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    if (button.dataset.label) button.setAttribute('aria-label', button.dataset.label);
    else button.removeAttribute('aria-label');
    delete button.dataset.label;
  }
}

/* ----------------------------------------------------- Erros de formulário */

/** Exibe { campo: "mensagem" } vindos da API ao lado de cada campo. */
export function showFieldErrors(form, errors = {}) {
  clearFieldErrors(form);
  let firstInvalid = null;
  Object.entries(errors).forEach(([name, message]) => {
    const input = form.elements.namedItem(name);
    if (!input || !(input instanceof HTMLElement)) return;
    const field = input.closest('.form-field');
    const errorId = `err-${name}`;
    field?.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
    const p = document.createElement('p');
    p.className = 'form-error';
    p.id = errorId;
    p.textContent = message;
    field?.append(p);
    firstInvalid ??= input;
  });
  firstInvalid?.focus();
}

export function clearFieldErrors(form) {
  form.querySelectorAll('.form-error').forEach((el) => el.remove());
  form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
  form.querySelectorAll('[aria-invalid]').forEach((el) => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
}

/* ------------------------------------------------------- Modal de formulário */

/**
 * Modal com formulário. onSubmit(form, close) deve retornar uma Promise;
 * erros 422 da API são exibidos automaticamente nos campos.
 *
 *   formModal({
 *     title: 'Nova categoria',
 *     body: '<div class="form-field">…</div>',
 *     submitText: 'Salvar',
 *     onSubmit: async (form) => { await api.post(...); },
 *   });
 */
export function formModal({ title, body, submitText = 'Salvar', size = '', onOpen, onSubmit }) {
  const previousFocus = document.activeElement;
  const id = `fmodal-${Date.now()}`;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <form class="modal__dialog modal__dialog--form ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-t" novalidate>
      <div class="modal__head">
        <h2 class="modal__title" id="${id}-t">${escapeHTML(title)}</h2>
        <button class="btn btn--ghost btn--icon btn--sm" type="button" data-close aria-label="Fechar">${icon('close')}</button>
      </div>
      <div class="modal__body">${body}</div>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" data-close>Cancelar</button>
        <button class="btn btn--gold" type="submit">${escapeHTML(submitText)}</button>
      </div>
    </form>`;

  const form = modal.querySelector('form');
  const submit = form.querySelector('[type="submit"]');

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    modal.classList.add('is-leaving');
    setTimeout(() => {
      modal.remove();
      if (!document.querySelector('.modal')) document.body.classList.remove('is-locked');
      previousFocus?.focus?.();
    }, 180);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const focusable = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    clearFieldErrors(form);
    setLoading(submit, true);
    try {
      await onSubmit(form, close);
    } catch (err) {
      if (err.status === 422 && err.errors && Object.keys(err.errors).length) {
        showFieldErrors(form, err.errors);
      } else if (err.status !== 401) {
        toast(err.message, 'error');
      }
    } finally {
      setLoading(submit, false);
    }
  });

  document.addEventListener('keydown', onKey, true);
  document.body.append(modal);
  document.body.classList.add('is-locked');
  onOpen?.(form);
  (form.querySelector('input:not([type="hidden"]), select, textarea') || submit).focus();
  return { form, close };
}

/** Modal apenas de leitura (ex.: visualizar imóvel). */
export function viewModal({ title, body, size = 'modal__dialog--lg', footer = '' }) {
  const previousFocus = document.activeElement;
  const id = `vmodal-${Date.now()}`;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog modal__dialog--form ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="modal__head">
        <h2 class="modal__title" id="${id}-t">${escapeHTML(title)}</h2>
        <button class="btn btn--ghost btn--icon btn--sm" type="button" data-close aria-label="Fechar">${icon('close')}</button>
      </div>
      <div class="modal__body">${body}</div>
      ${footer ? `<div class="modal__actions">${footer}</div>` : ''}
    </div>`;
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    modal.classList.add('is-leaving');
    setTimeout(() => {
      modal.remove();
      if (!document.querySelector('.modal')) document.body.classList.remove('is-locked');
      previousFocus?.focus?.();
    }, 180);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(modal);
  document.body.classList.add('is-locked');
  modal.querySelector('[data-close].btn').focus();
  return { modal, close };
}

/* ------------------------------------------------------- Menu de ações */

let openMenu = null;

function closeActionMenu() {
  if (!openMenu) return;
  const { menu, trigger } = openMenu;
  menu.remove();
  trigger.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

/**
 * Menu flutuante ancorado a um botão.
 * items: [{ label, icon, onClick, danger?, hidden? } | 'divider']
 */
export function actionMenu(trigger, items) {
  const wasOpen = openMenu?.trigger === trigger;
  closeActionMenu();
  if (wasOpen) return;

  const menu = document.createElement('div');
  menu.className = 'action-menu';
  menu.setAttribute('role', 'menu');
  items.filter((it) => it && !it.hidden).forEach((it) => {
    if (it === 'divider') {
      menu.insertAdjacentHTML('beforeend', '<hr class="action-menu__divider">');
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown__item${it.danger ? ' dropdown__item--danger' : ''}`;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `${icon(it.icon || 'arrowRight')}<span>${escapeHTML(it.label)}</span>`;
    btn.addEventListener('click', () => { closeActionMenu(); it.onClick(); });
    menu.append(btn);
  });
  document.body.append(menu);

  // Posiciona abaixo do botão, sem sair da tela
  const r = trigger.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  let left = r.right - mw;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  trigger.setAttribute('aria-expanded', 'true');
  openMenu = { menu, trigger, openedAt: performance.now() };
  menu.querySelector('button')?.focus({ preventScroll: true });

  menu.addEventListener('keydown', (e) => {
    const buttons = [...menu.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeActionMenu(); trigger.focus(); }
  });
}

document.addEventListener('click', (e) => {
  if (openMenu && !openMenu.menu.contains(e.target) && !openMenu.trigger.contains(e.target)) closeActionMenu();
});
window.addEventListener('resize', closeActionMenu);
// Rolagem fecha o menu (exceto a rolagem automática logo após abrir)
window.addEventListener('scroll', (e) => {
  if (!openMenu || openMenu.menu.contains(e.target)) return;
  if (performance.now() - openMenu.openedAt > 250) closeActionMenu();
}, true);

/* ----------------------------------------------------------- Utilidades */

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function emptyState({ iconName = 'home', title, text = '', action = '' }) {
  return `
    <div class="empty">
      <span class="empty__icon">${icon(iconName)}</span>
      <p class="empty__title">${escapeHTML(title)}</p>
      ${text ? `<p class="empty__text">${escapeHTML(text)}</p>` : ''}
      ${action}
    </div>`;
}

/** Paginação: "Mostrando 1–20 de 57" + botões. onChange(page). */
export function renderPagination(container, meta, onChange) {
  if (!meta || meta.total === 0) { container.innerHTML = ''; return; }
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  const pages = [];
  const add = (p) => { if (p >= 1 && p <= meta.pages && !pages.includes(p)) pages.push(p); };
  [1, meta.page - 1, meta.page, meta.page + 1, meta.pages].forEach(add);
  pages.sort((a, b) => a - b);

  let buttons = '';
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) buttons += '<span class="pagination__gap">…</span>';
    buttons += `<button class="pagination__page" type="button" data-page="${p}" ${p === meta.page ? 'aria-current="page"' : ''}>${p}</button>`;
  });

  container.innerHTML = `
    <p class="pagination__info">Mostrando <b>${from}–${to}</b> de <b>${meta.total}</b></p>
    <nav class="pagination__nav" aria-label="Paginação">
      <button class="pagination__page" type="button" data-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevronLeft')}</button>
      ${buttons}
      <button class="pagination__page" type="button" data-page="${meta.page + 1}" ${meta.page >= meta.pages ? 'disabled' : ''} aria-label="Próxima página">${icon('chevronRight')}</button>
    </nav>`;
  container.onclick = (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn && !btn.disabled && Number(btn.dataset.page) !== meta.page) onChange(Number(btn.dataset.page));
  };
}

/** Avisa antes de sair da página com alterações não salvas. */
export function guardUnsaved(isDirty) {
  const handler = (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
