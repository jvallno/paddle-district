// Session leaderboard table (spec §6): Wins / Points / Win% / Pt%, ties broken
// by score diff. Shared by the organizer Rankings tab and the TV view.
import { html } from '../../lib/html.js';
import { sessionStats, rankRows } from '../../lib/session-stats.js';

export const SORTS = [['wins', 'Wins'], ['points', 'Points'], ['winpct', 'Win %'], ['ptpct', 'Pt %']];

export function rankingsHtml(matches, sortKey = 'wins', { limit } = {}) {
  const rows = rankRows(sessionStats(matches), sortKey).slice(0, limit ?? Infinity);
  if (!rows.length) return html`<p class="page__sub">Rankings appear after the first score.</p>`;
  return html`
    <table class="rankings">
      <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">GP</th><th scope="col">W</th><th scope="col">L</th><th scope="col">Pts</th><th scope="col">+/-</th><th scope="col">Win%</th><th scope="col">Pt%</th></tr></thead>
      <tbody>${rows.map((r, i) => html`
        <tr>
          <td class="num">${i + 1}</td><th scope="row">${r.name}</th>
          <td class="num">${r.gp}</td><td class="num">${r.wins}</td><td class="num">${r.losses}</td>
          <td class="num">${r.points}</td><td class="num">${r.diff > 0 ? `+${r.diff}` : r.diff}</td>
          <td class="num">${r.winPct}%</td><td class="num">${r.ptPct}%</td>
        </tr>`)}</tbody>
    </table>`;
}
