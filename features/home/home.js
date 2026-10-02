// Home (#/home). Placeholder until Plan 3 brings My Sessions here.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';

export function init(container) {
  const { profile } = getSession();
  container.innerHTML = html`
    <section class="page home">
      <h1 class="page__title">Hi, ${profile.displayName}</h1>
      <div class="card home__soon">
        <h2 class="home__soon-title">Sessions are coming next</h2>
        <p class="page__sub">Soon you'll create open-play sessions, check in by QR, and queue for courts from here.</p>
      </div>
      <a class="btn btn--secondary home__card-link" href="#/me">Show my player card</a>
    </section>`;
}
