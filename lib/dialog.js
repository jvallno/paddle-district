// Form dialog styled like lib/confirm.js. body is an html`` fragment with the
// form's fields; the promise resolves to a plain object of the submitted
// fields (FormData), or null on cancel / Escape / backdrop click.
// validate(values) may return an error message to keep the dialog open.
import { html } from './html.js';

export function openDialog({ title, body, submitLabel = 'Save', danger = false, validate } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = html`
      <form class="modal__card modal__card--wide" role="dialog" aria-modal="true" aria-labelledby="dialog-title" novalidate>
        <h2 class="modal__title" id="dialog-title">${title}</h2>
        <div class="dialog__body">${body}</div>
        <p class="field__error dialog__error" aria-live="polite"></p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${submitLabel}</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    (form.querySelector('input, select, textarea') ?? form.querySelector('[type="submit"]')).focus();

    let done = false;
    function close(result) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      opener?.focus?.();
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') close(null); }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const error = validate?.(values);
      if (error) { form.querySelector('.dialog__error').textContent = error; return; }
      close(values);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="cancel"]') || e.target === overlay) close(null);
    });
    document.addEventListener('keydown', onKey);
  });
}
