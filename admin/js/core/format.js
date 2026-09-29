/** Formatação e rótulos compartilhados. */

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateLongFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export const STATUS = {
  disponivel:   'Disponível',
  reservado:    'Reservado',
  vendido:      'Vendido',
  alugado:      'Alugado',
  indisponivel: 'Indisponível',
  rascunho:     'Rascunho',
};

export const TRANSACTION = { venda: 'Venda', aluguel: 'Aluguel' };

export const ROLES = { admin: 'Administrador', editor: 'Editor' };

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatPrice(value, transaction) {
  if (value === null || value === undefined || value === '') return 'Sob consulta';
  const text = currencyFmt.format(Number(value));
  return transaction === 'aluguel' ? `${text}/mês` : text;
}

/** Datas vindas do MySQL ("2026-09-25 14:30:00") sem problemas de fuso. */
export function parseDate(value) {
  if (!value) return null;
  const [d, t = '00:00:00'] = String(value).split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min, s] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min, s);
}

export function formatDate(value) {
  const date = parseDate(value);
  return date ? dateFmt.format(date).replace('.', '') : '—';
}

export function todayLong() {
  const text = dateLongFmt.format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function statusBadge(status) {
  const label = STATUS[status] || status;
  return `<span class="badge badge--${escapeHTML(status)}">${escapeHTML(label)}</span>`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || '';
}
