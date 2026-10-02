// Self-rating picker shared by profile setup and the My profile edit form.
import { html } from '../../lib/html.js';
import { ratingOptions, levelFor } from '../../lib/profile-input.js';

export function ratingFieldHtml(selected) {
  const level = levelFor(selected);
  return html`
    <label class="field">
      <span class="field__label">Your level</span>
      <select class="input" name="selfRating">
        ${ratingOptions().map((r) => html`<option value="${r}" ${r === selected ? 'selected' : ''}>${r.toFixed(1)} · ${levelFor(r).label}</option>`)}
      </select>
      <span class="field__hint" data-level-hint>${level ? level.hint : ''}</span>
      <span class="field__error" data-error="selfRating"></span>
    </label>`;
}

// Keeps the hint under the picker in step with the chosen level.
export function wireRatingField(form) {
  const select = form.querySelector('[name="selfRating"]');
  const hint = form.querySelector('[data-level-hint]');
  select.addEventListener('change', () => {
    hint.textContent = levelFor(Number(select.value))?.hint ?? '';
  });
}

// Shows each field's message (or clears it) from validateProfileInput().errors.
export function showErrors(form, errors) {
  for (const el of form.querySelectorAll('[data-error]')) {
    const msg = errors[el.dataset.error] ?? '';
    el.textContent = msg;
    form.querySelector(`[name="${el.dataset.error}"]`)?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
}
