// Public player profile (#/u/{handle}) — where a player-card QR lands.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { normalizeHandle, isValidHandle } from '../../lib/handle.js';
import { levelFor } from '../../lib/profile-input.js';
import { findByHandle } from '../../lib/profiles.js';

export function init(container, param) {
  let raw = param ?? '';
  try { raw = decodeURIComponent(raw); } catch { /* malformed escape → treated as an invalid handle below */ }
  const handle = normalizeHandle(raw);
  let alive = true;
  container.addEventListener('view:teardown', () => { alive = false; }, { once: true });

  const show = (body) => { if (alive) container.innerHTML = html`<section class="page profile">${body}</section>`; };
  const missing = (why) => show(html`
    <h1 class="page__title">No player found</h1>
    <p class="page__sub">${why}</p>
    <a class="btn btn--secondary profile__back" href="#/home">Back home</a>`);

  if (!isValidHandle(handle)) { missing("This isn't a valid player link."); return; }
  show(html`<p class="page__sub">Loading @${handle}…</p>`);

  findByHandle(handle).then((p) => {
    if (!p) { missing(`Nobody has the handle @${handle}.`); return; }
    const mine = p.uid === getSession().user?.uid;
    show(html`
      <div class="card profile__card">
        ${avatarHtml(p, { large: true })}
        <h1 class="profile__name">${p.displayName}</h1>
        <p class="profile__handle">@${p.handle}</p>
        <span class="pill pill--gold">${p.selfRating.toFixed(1)} · ${levelFor(p.selfRating)?.label ?? ''}</span>
        ${mine ? html`<a class="btn btn--secondary profile__edit" href="#/me">Edit my profile</a>` : ''}
      </div>`);
  }).catch((err) => show(html`
    <h1 class="page__title">Couldn't load this player</h1>
    <p class="page__sub">${err.message}</p>`));
}
