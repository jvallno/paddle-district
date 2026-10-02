// App header, shown once the player has a profile. Rendered by lib/app.js.
import { html } from '../../lib/html.js';
import { avatarHtml } from '../../lib/avatar.js';

export function renderTopbar(el, { status, profile }) {
  el.hidden = status !== 'ready';
  el.innerHTML = status === 'ready'
    ? html`
      <a class="topbar__brand" href="#/home">Paddle District</a>
      <a class="topbar__me" href="#/me" aria-label="My profile">${avatarHtml(profile)}</a>`
    : '';
}
