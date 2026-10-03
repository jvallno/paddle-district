// Settings tab: court rule, share link + QR show/hide, export, end/continue.
import { html, raw } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { showConfirm } from '../../lib/confirm.js';
import { appUrl } from '../../lib/app-url.js';
import { updateSession, endSession, continueSession } from '../../lib/sessions.js';
import { exportCsv, exportJson, exportFilename } from '../../lib/session-export.js';
import { COURT_RULES } from '../../lib/session-model.js';
import { isEnded } from './floor.js';

const RULE_LABELS = { everyoneOff: 'Everyone off', winnersStay: 'Winners stay', winnersSplit: 'Winners split' };

function download(text, type, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function mount(panel, ctx) {
  const liveUrl = appUrl(window.location, `#/tv/${ctx.sid}`);
  panel.innerHTML = html`
    <form class="card settings__rule" data-rule novalidate>
      <h2 class="card__title">Court rule</h2>
      <label class="field"><span class="field__label">After each game</span>
        <select class="input" name="type">${COURT_RULES.map((r) => html`<option value="${r}">${RULE_LABELS[r]}</option>`)}</select>
      </label>
      <label class="field" data-maxwins><span class="field__label">Max wins in a row</span>
        <input class="input" type="number" name="maxWins" min="1" max="5" step="1" inputmode="numeric">
        <span class="field__error" data-maxwins-error aria-live="polite"></span>
      </label>
      <button class="btn btn--primary" type="submit">Save rule</button>
    </form>
    <section class="card settings__share">
      <h2 class="card__title">Share the live view</h2>
      <p class="page__sub">Courts, queue and rankings for players and a TV — no sign-in needed.</p>
      <div class="settings__link"><input class="input" readonly value="${liveUrl}" aria-label="Live view link"><button type="button" class="btn btn--secondary" data-copy>Copy</button></div>
      <a class="btn btn--ghost" href="${liveUrl}" target="_blank" rel="noopener">Open live view ↗</a>
      <label class="check"><input type="checkbox" data-qr-toggle> Show the QR code on the live view</label>
      <div class="settings__qr" data-qr></div>
    </section>
    <section class="card settings__export">
      <h2 class="card__title">Export</h2>
      <div class="settings__row">
        <button type="button" class="btn btn--secondary" data-export="csv">⬇ CSV</button>
        <button type="button" class="btn btn--secondary" data-export="json">⬇ JSON</button>
      </div>
    </section>
    <section class="card settings__end">
      <h2 class="card__title" data-end-title>End session</h2>
      <p class="page__sub" data-end-text></p>
      <button type="button" class="btn" data-end></button>
    </section>`;

  const ruleForm = panel.querySelector('[data-rule]');
  const syncMaxWins = () => { panel.querySelector('[data-maxwins]').hidden = ruleForm.elements.type.value === 'everyoneOff'; };
  const maxInput = ruleForm.elements.maxWins;
  const maxErr = ruleForm.querySelector('[data-maxwins-error]');
  const clearMaxErr = () => { maxErr.textContent = ''; maxInput.setAttribute('aria-invalid', 'false'); };
  maxInput.addEventListener('input', clearMaxErr);
  ruleForm.addEventListener('change', syncMaxWins);
  ruleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = ruleForm.elements.type.value;
    const maxWins = Number(ruleForm.elements.maxWins.value);
    if (type !== 'everyoneOff' && (!Number.isInteger(maxWins) || maxWins < 1 || maxWins > 5)) {
      maxErr.textContent = 'Max wins: 1 to 5.';
      maxInput.setAttribute('aria-invalid', 'true');
      maxInput.focus();
      return;
    }
    clearMaxErr();
    ctx.sync.track(updateSession(ctx.sid, { courtRule: { type, maxWins: type === 'everyoneOff' ? 2 : maxWins } }))
      .catch((err) => showToast(`Couldn't save: ${err.message}`, 'error'));
    showToast('Court rule saved — it applies from the next game.', 'success');
  });

  // The QR is generated once (lazily, like the player card).
  import('../../lib/qr.js').then(({ qrSvg }) => {
    panel.querySelector('[data-qr]').innerHTML = html`${raw(qrSvg(liveUrl))}`;
  }).catch(() => { panel.querySelector('[data-qr]').textContent = 'QR code unavailable — check your connection.'; });

  panel.addEventListener('change', (e) => {
    if (!e.target.matches('[data-qr-toggle]')) return;
    ctx.sync.track(updateSession(ctx.sid, { shareQr: e.target.checked })).catch((err) => showToast(`Couldn't save: ${err.message}`, 'error'));
  });
  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-copy')) {
      navigator.clipboard.writeText(liveUrl).then(() => showToast('Link copied.', 'success'), () => showToast('Copy failed — select the link and copy it.', 'error'));
    } else if (btn.dataset.export) {
      const s = ctx.session;
      if (btn.dataset.export === 'csv') download(exportCsv(s, ctx.participants, ctx.matches), 'text/csv', exportFilename(s.name, s.date, 'csv'));
      else download(JSON.stringify(exportJson(s, ctx.participants, ctx.matches, Date.now()), null, 2), 'application/json', exportFilename(s.name, s.date, 'json'));
    } else if (btn.hasAttribute('data-end')) {
      if (isEnded(ctx)) {
        ctx.sync.track(continueSession(ctx.sid)).catch((err) => showToast(`Couldn't continue: ${err.message}`, 'error'));
        return;
      }
      const ok = await showConfirm({ title: 'End this session?', message: 'The queue stops and the clock freezes. You can export now, fix scores later, or continue the session.', confirmLabel: 'End session', danger: true });
      if (ok) ctx.sync.track(endSession(ctx.sid)).catch((err) => showToast(`Couldn't end: ${err.message}`, 'error'));
    }
  });

  return {
    update(c) {
      const s = c.session;
      // Only refill the rule form when it isn't being edited.
      if (!ruleForm.contains(document.activeElement)) {
        ruleForm.elements.type.value = s.courtRule?.type ?? 'everyoneOff';
        ruleForm.elements.maxWins.value = s.courtRule?.maxWins ?? 2;
        syncMaxWins();
      }
      panel.querySelector('[data-qr-toggle]').checked = !!s.shareQr;
      const ended = isEnded(c);
      panel.querySelector('[data-end-title]').textContent = ended ? 'Session ended' : 'End session';
      panel.querySelector('[data-end-text]').textContent = ended ? 'Continue to restart the queue and the clock.' : 'Stops the queue and freezes the clock.';
      const btn = panel.querySelector('[data-end]');
      btn.textContent = ended ? 'Continue session' : 'End session';
      btn.className = `btn ${ended ? 'btn--accent' : 'btn--danger'}`;
    },
  };
}
