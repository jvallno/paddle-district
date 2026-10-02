import { html } from './html.js';

// Promise-based confirm dialog styled to match the app. Resolves true on
// confirm, false on cancel / Escape / backdrop click. Async (unlike native
// confirm) so the page keeps repainting while it's open.
export function showConfirm({
  title = '',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = html`
      <div class="modal__card" role="dialog" aria-modal="true"${title ? ' aria-labelledby="modal-title"' : ''}>
        ${title ? html`<h2 class="modal__title" id="modal-title">${title}</h2>` : ''}
        ${message ? html`<p class="modal__message">${message}</p>` : ''}
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">${cancelLabel}</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="confirm">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="confirm"]').focus();

    let done = false;
    function close(result) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    }
    overlay.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) close(act.dataset.act === 'confirm');
      else if (e.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKey);
  });
}
