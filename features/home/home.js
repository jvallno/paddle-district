// Placeholder landing view — shows the feature convention (init + html`` +
// view:teardown). Replace once the app's first real screen is designed.
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';

export function init(container) {
  container.innerHTML = html`
    <section class="home">
      <p class="home__kicker">Pickle Boat</p>
      <h1 class="home__title">Paddle stacking for open play</h1>
      <p class="home__sub">Scaffold is running. Next step: brainstorm how the app works.</p>
      <button type="button" class="btn btn--primary" id="ping">Check toast</button>
    </section>`;

  const onPing = () => showToast('Everything is wired up.', 'success');
  container.querySelector('#ping').addEventListener('click', onPing);
  container.addEventListener('view:teardown', () => {
    // Unsubscribe snapshots / timers here once the view has any.
  }, { once: true });
}
