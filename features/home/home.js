// Home (#/home). Placeholder until Plan 3 brings My Sessions here.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';

export function init(container) {
  const { profile } = getSession();
  container.innerHTML = html`
    <section class="page home">
      <div class="home__hello">
        <p class="eyebrow">Welcome back</p>
        <h1 class="page__title">Hi, ${profile.displayName} 👋</h1>
      </div>
      <div class="card home__soon">
        <span class="home__soon-icon" aria-hidden="true">🏓</span>
        <h2 class="card__title">Open play sessions are coming next</h2>
        <p class="page__sub">Soon you'll check in by QR, queue for courts from your phone, and see when you're up — right here.</p>
      </div>
      <a class="btn btn--primary btn--block" href="#/me">Show my player card</a>
    </section>`;
}
