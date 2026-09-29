/**
 * Página genérica para cadastros simples (nome + ativo + ordem):
 * Categorias (tipos de imóvel) e Características.
 * A página define no <body>: data-catalog="categories|features".
 */
import { api } from '../core/api.js';
import { initLayout } from '../core/layout.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, formModal, actionMenu, emptyState } from '../core/ui.js';
import { escapeHTML } from '../core/format.js';

const CONFIG = {
  categories: {
    page: 'categories', title: 'Categorias', crumb: 'Tipos de imóvel',
    singular: 'categoria', newLabel: 'Nova categoria', placeholder: 'Ex.: Apartamento, Casa, Terreno',
    usage: (n) => n ? `${n} imóve${n === 1 ? 'l' : 'is'}` : 'Sem imóveis',
    hint: 'Categorias inativas não aparecem no formulário de imóvel nem nos filtros do site.',
  },
  features: {
    page: 'features', title: 'Características', crumb: 'Itens marcados no imóvel',
    singular: 'característica', newLabel: 'Nova característica', placeholder: 'Ex.: Piscina, Academia, Varanda',
    usage: (n) => n ? `Em ${n} imóve${n === 1 ? 'l' : 'is'}` : 'Não usada',
    hint: 'Características inativas deixam de aparecer no formulário, mas continuam nos imóveis que já as têm.',
  },
};

const kind = document.body.dataset.catalog;
const cfg = CONFIG[kind];
const listEl = document.getElementById('list');
let items = [];
let user;

function render() {
  listEl.removeAttribute('aria-busy');
  if (!items.length) {
    listEl.innerHTML = emptyState({ iconName: kind === 'features' ? 'checklist' : 'tag', title: `Nenhuma ${cfg.singular} cadastrada.`,
      action: `<button class="btn btn--gold" type="button" data-new>${icon('plus')}<span>${cfg.newLabel}</span></button>` });
    return;
  }
  listEl.innerHTML = `<div class="list-rows">${items.map((it) => `
    <div class="list-row${it.active ? '' : ' is-inactive'}" data-id="${it.id}">
      <div>
        <p class="list-row__title">${escapeHTML(it.name)}</p>
        <p class="list-row__meta">${escapeHTML(cfg.usage(it.usage_count))} · ordem ${it.sort_order}</p>
      </div>
      ${it.active ? '<span class="badge badge--disponivel">Ativa</span>' : '<span class="badge badge--indisponivel">Inativa</span>'}
      <div class="row-actions">
        <button class="icon-btn" type="button" data-edit aria-label="Editar ${escapeHTML(it.name)}">${icon('edit')}</button>
        <button class="icon-btn" type="button" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações para ${escapeHTML(it.name)}">${icon('dots')}</button>
      </div>
    </div>`).join('')}</div>`;
}

async function load() {
  try {
    const { data } = await api.get(`${kind}/index.php`);
    items = data.items;
    render();
  } catch (err) {
    if (err.status !== 401) listEl.innerHTML = emptyState({ iconName: 'alert', title: 'Não foi possível carregar.', text: err.message });
  }
}

function openForm(item = null) {
  formModal({
    title: item ? `Editar ${cfg.singular}` : cfg.newLabel,
    submitText: item ? 'Salvar alterações' : 'Cadastrar',
    body: `
      <div class="form-field">
        <label for="mName">Nome<span class="req">*</span></label>
        <input class="input" id="mName" name="name" maxlength="80" required placeholder="${escapeHTML(cfg.placeholder)}" value="${escapeHTML(item?.name || '')}">
      </div>
      <div class="form-field">
        <label for="mOrder">Ordem de exibição</label>
        <input class="input" id="mOrder" name="sort_order" type="number" min="0" max="9999" inputmode="numeric" value="${item ? item.sort_order : ''}" placeholder="Automática">
      </div>
      <div class="form-field">
        <label class="switch">
          <input type="checkbox" name="active" ${!item || item.active ? 'checked' : ''}>
          <span class="switch__track"></span>
          <span class="switch__label">Ativa<span class="switch__text">${escapeHTML(cfg.hint)}</span></span>
        </label>
      </div>`,
    onSubmit: async (form, close) => {
      const res = await api.post(`${kind}/save.php`, {
        id: item?.id,
        name: form.name.value.trim(),
        sort_order: form.sort_order.value === '' ? null : Number(form.sort_order.value),
        active: form.active.checked,
      });
      toast(res.message);
      close();
      load();
    },
  });
}

async function remove(item) {
  const ok = await confirmDialog({
    title: `Excluir ${cfg.singular}?`,
    text: `"${item.name}" será removida permanentemente.`,
    confirmText: 'Excluir',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await api.post(`${kind}/delete.php`, { id: item.id });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

async function toggleActive(item) {
  try {
    const res = await api.post(`${kind}/save.php`, { id: item.id, name: item.name, sort_order: item.sort_order, active: !item.active });
    toast(res.message);
    load();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-new]')) { openForm(); return; }
  const row = e.target.closest('.list-row');
  if (!row) return;
  const item = items.find((i) => i.id === Number(row.dataset.id));
  if (e.target.closest('[data-edit]')) openForm(item);
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) {
    actionMenu(menuBtn, [
      { label: 'Editar', icon: 'edit', onClick: () => openForm(item) },
      { label: item.active ? 'Desativar' : 'Ativar', icon: item.active ? 'eyeOff' : 'eye', onClick: () => toggleActive(item) },
      { label: 'Excluir', icon: 'trash', danger: true, hidden: user.role !== 'admin', onClick: () => remove(item) },
    ]);
  }
});

(async () => {
  try {
    ({ user } = await initLayout({ page: cfg.page, title: cfg.title, crumb: cfg.crumb }));
  } catch {
    return;
  }
  load();
})();
