/**
 * Máscara de moeda brasileira para inputs ("2.450.000,00").
 * O valor enviado para a API é sempre número (parseMoney).
 */

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? fmt.format(n) : '';
}

export function parseMoney(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return Number(digits) / 100;
}

/** Digitação da direita para a esquerda, como em apps de banco. */
export function moneyInput(input) {
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', () => {
    const value = parseMoney(input.value);
    input.value = value === null ? '' : fmt.format(value);
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

export function parseDecimal(text) {
  const s = String(text ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatDecimal(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace('.', ',');
}
