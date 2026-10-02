// Auto-escaping HTML templates. Pure (no DOM) so it runs under node --test.
//
//   container.innerHTML = html`<td>${product.name}</td>`;
//
// Every ${value} is escaped unless it is itself an html`` fragment or wrapped
// in raw(). Arrays are joined, so `${items.map(i => html`<li>${i}</li>`)}`
// works without .join(''). null / undefined render as nothing; booleans print
// as "true"/"false" like a plain template literal (so data-x="${flag}" works).
// An array assigned straight to innerHTML gets comma-joined by the browser —
// wrap it: el.innerHTML = html`${items.map(...)}`.
import { escapeHtml } from './escape.js';

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

function render(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value == null) return '';
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// Trusted markup only — never pass user-supplied data here.
export function raw(markup) {
  return new SafeHtml(String(markup ?? ''));
}
