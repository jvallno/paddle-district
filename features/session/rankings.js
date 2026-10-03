// Rankings tab: the session leaderboard with v1's four sort options.
import { html } from '../../lib/html.js';
import { rankingsHtml, SORTS } from '../shared/rankings-table.js';

export function mount(panel, ctx) {
  let sort = 'wins';
  panel.innerHTML = html`
    <section class="card">
      <div class="seg seg--wide" role="group" aria-label="Sort rankings by">
        ${SORTS.map(([key, label]) => html`<button type="button" class="seg__btn" data-sort="${key}" aria-pressed="${key === sort}">${label}</button>`)}
      </div>
      <div class="rankings-wrap" data-table></div>
    </section>`;
  const draw = () => {
    panel.querySelectorAll('[data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
    panel.querySelector('[data-table]').innerHTML = rankingsHtml(ctx.matches, sort);
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (b) { sort = b.dataset.sort; draw(); }
  });
  return { update(c) { ctx = c; draw(); } };
}
