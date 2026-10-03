// Create session (#/new, spec §13.1). Mode is fairness in 3a; stacking comes in 3c.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { showToast } from '../../lib/toast.js';
import { createSession } from '../../lib/sessions.js';
import { validateSessionInput, localDate, MAX_COURTS, SESSION_NAME_MAX, VENUE_MAX } from '../../lib/session-model.js';

const RULES = [
  ['everyoneOff', 'Everyone off', 'All four leave after each game.'],
  ['winnersStay', 'Winners stay', 'Winners keep the court and face the next two.'],
  ['winnersSplit', 'Winners split', 'Winners stay but each partners a newcomer.'],
];

export function init(container) {
  const { user } = getSession();
  container.innerHTML = html`
    <section class="page new-session">
      <a class="new-session__back" href="#/home">← My sessions</a>
      <h1 class="page__title">New session</h1>
      <form class="card new-session__form" novalidate>
        <label class="field">
          <span class="field__label">Session name</span>
          <input class="input" name="name" maxlength="${SESSION_NAME_MAX}" placeholder="Saturday open play" autocomplete="off">
          <span class="field__error" data-error="name" aria-live="polite"></span>
        </label>
        <div class="new-session__row">
          <label class="field">
            <span class="field__label">Date</span>
            <input class="input" type="date" name="date" value="${localDate(new Date())}">
            <span class="field__error" data-error="date" aria-live="polite"></span>
          </label>
          <label class="field">
            <span class="field__label">Courts</span>
            <input class="input" type="number" name="courts" min="1" max="${MAX_COURTS}" step="1" value="2" inputmode="numeric">
            <span class="field__error" data-error="courts" aria-live="polite"></span>
          </label>
        </div>
        <label class="field">
          <span class="field__label">Venue (optional)</span>
          <input class="input" name="venue" maxlength="${VENUE_MAX}" placeholder="e.g. Elm Park courts">
          <span class="field__error" data-error="venue" aria-live="polite"></span>
        </label>
        <fieldset class="field new-session__rules">
          <legend class="field__label">Court rule</legend>
          ${RULES.map(([value, label, hint], i) => html`
            <label class="choice">
              <input type="radio" name="ruleType" value="${value}" ${i === 0 ? 'checked' : ''}>
              <span><strong>${label}</strong><span class="choice__hint">${hint}</span></span>
            </label>`)}
          <span class="field__error" data-error="ruleType" aria-live="polite"></span>
        </fieldset>
        <label class="field" data-maxwins hidden>
          <span class="field__label">Max wins in a row</span>
          <input class="input" type="number" name="maxWins" min="1" max="5" step="1" value="2" inputmode="numeric">
          <span class="field__error" data-error="maxWins" aria-live="polite"></span>
        </label>
        <button class="btn btn--primary btn--block" type="submit">Create session</button>
      </form>
    </section>`;

  const form = container.querySelector('form');
  const maxWins = form.querySelector('[data-maxwins]');
  form.addEventListener('change', () => {
    maxWins.hidden = form.elements.ruleType.value === 'everyoneOff';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { ok, value, errors } = validateSessionInput(Object.fromEntries(new FormData(form)));
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = errors[el.dataset.error] ?? '';
      el.closest('.field')?.querySelector('.input')?.setAttribute('aria-invalid', String(!!errors[el.dataset.error]));
    });
    if (!ok) {
      form.querySelector('[aria-invalid="true"], [data-error]:not(:empty)')?.closest('.field')?.querySelector('input')?.focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creating…';
    const { sid, done } = createSession(user.uid, value); // offline-tolerant: syncs later
    done.catch((err) => showToast(`Couldn't save the session: ${err.message}`, 'error'));
    window.location.hash = `#/s/${sid}`;
  });
}
