// Scores tab: game history, newest first; edit a past score (an override).
import { html } from '../../lib/html.js';
import { formatClock } from '../../lib/time-format.js';
import { gameHistory } from '../../lib/session-export.js';
import { teamHtml, scoreDialog } from './floor.js';

export function mount(panel, ctx) {
  panel.innerHTML = html`<section class="card"><h2 class="card__title">Game history</h2><ol class="history" data-history reversed></ol></section>`;
  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) scoreDialog(ctx, ctx.matches.find((m) => m.mid === btn.dataset.edit));
  });
  return {
    update(c) {
      const courtName = new Map(c.session.courts.map((ct) => [ct.id, ct.name]));
      const games = gameHistory(c.matches);
      panel.querySelector('[data-history]').innerHTML = games.length
        ? html`${games.map((m, i) => ({ m, round: i + 1 })).reverse().map(({ m, round }) => html`
            <li class="history__row">
              <span class="history__meta">Game ${round} · ${courtName.get(m.courtId) ?? m.courtId}${m.endedAt != null ? html` · ${formatClock(m.endedAt - m.startedAt)}` : ''}</span>
              <span class="history__teams">${teamHtml(m, 'team1')} <strong class="history__score num">${m.score.t1}–${m.score.t2}</strong> ${teamHtml(m, 'team2')}</span>
              <button type="button" class="btn btn--ghost btn--sm" data-edit="${m.mid}">Edit</button>
            </li>`)}`
        : html`<li class="page__sub">No games scored yet.</li>`;
    },
  };
}
