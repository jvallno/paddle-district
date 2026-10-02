// App header (v1 style), shown once the player has a profile. Rendered by lib/app.js.
import { html } from '../../lib/html.js';
import { avatarHtml } from '../../lib/avatar.js';
import { themeToggleHtml, wireThemeToggles } from '../../lib/theme.js';

export function renderTopbar(el, { status, profile }) {
  el.hidden = status !== 'ready';
  if (status !== 'ready') { el.innerHTML = ''; return; }
  el.innerHTML = html`
    <a class="topbar__brand" href="#/home">
      <span class="topbar__logo"><img src="/assets/logo-512.png" alt="" width="36" height="36"></span>
      <span class="topbar__name">Paddle District</span>
    </a>
    ${themeToggleHtml('theme-toggle--on-dark')}
    <a class="topbar__me" href="#/me" aria-label="My profile">${avatarHtml(profile)}</a>`;
  wireThemeToggles(el);
}
