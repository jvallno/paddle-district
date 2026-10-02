// My profile (#/me): player card with QR, edit name/level, sign out.
import { html, raw } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { getSession, onSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { levelFor, NAME_MAX, validateProfileInput } from '../../lib/profile-input.js';
import { updateProfile } from '../../lib/profiles.js';
import { signOut } from '../../lib/auth.js';
import { ratingFieldHtml, wireRatingField, showErrors, focusFirstError } from '../shared/rating-field.js';

// Absolute link to a public profile — what the player-card QR encodes.
export function profileUrl(handle) {
  return `${window.location.origin}${window.location.pathname}#/u/${handle}`;
}

function cardHtml(p) {
  return html`
    ${avatarHtml(p, { large: true })}
    <div class="me__who">
      <p class="me__name">${p.displayName}</p>
      <p class="me__handle">@${p.handle}</p>
      <span class="pill pill--gold">${p.selfRating.toFixed(1)} · ${levelFor(p.selfRating)?.label ?? ''}</span>
    </div>`;
}

// Load the QR generator lazily so a failed import can't blank the whole screen.
async function fillQr(box, handle, isAlive) {
  try {
    const { qrSvg } = await import('../../lib/qr.js');
    if (isAlive()) box.innerHTML = html`${raw(qrSvg(profileUrl(handle)))}`;
  } catch {
    if (isAlive()) box.textContent = 'QR code unavailable — check your connection.';
  }
}

export function init(container) {
  const p = getSession().profile;
  container.innerHTML = html`
    <section class="page me">
      <div class="card me__card">
        <div class="me__head" data-card>${cardHtml(p)}</div>
        <div class="me__qr" data-qr></div>
        <p class="me__qr-note">Show this to an organizer — they scan it with their phone camera to add you.</p>
      </div>
      <form class="card me__form" novalidate>
        <h2 class="me__form-title">Edit profile</h2>
        <label class="field">
          <span class="field__label">Name</span>
          <input class="input" name="displayName" value="${p.displayName}" maxlength="${NAME_MAX}" autocomplete="name">
          <span class="field__error" data-error="displayName" aria-live="polite"></span>
        </label>
        ${ratingFieldHtml(p.selfRating)}
        <button class="btn btn--primary" type="submit">Save</button>
      </form>
      <button type="button" class="btn btn--ghost me__signout" id="signout">Sign out</button>
    </section>`;

  let alive = true;
  fillQr(container.querySelector('[data-qr]'), p.handle, () => alive);

  const form = container.querySelector('form');
  wireRatingField(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const { ok, value, errors } = validateProfileInput(data);
    showErrors(form, errors);
    if (!ok) { focusFirstError(form); return; }
    // Applies locally at once and syncs when online (offline-tolerant).
    updateProfile(p.uid, value).catch((err) => showToast(`Could not save: ${err.message}`, 'error'));
    showToast('Profile saved.', 'success');
  });

  container.querySelector('#signout').addEventListener('click', () => {
    signOut().catch((err) => showToast(`Could not sign out: ${err.message}`, 'error'));
  });

  // Keep the card in sync with saved edits (the form keeps what's typed).
  const head = container.querySelector('[data-card]');
  const off = onSession((s) => { if (s.profile) head.innerHTML = cardHtml(s.profile); });
  container.addEventListener('view:teardown', () => { alive = false; off(); }, { once: true });
}
