let host;

function ensureHost() {
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  ensureHost().appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
