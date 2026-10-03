// Courts tab: live courts with timers; score / swap / cancel; add, rename and
// pause courts; "Up next" from the host's live state. After the session ends,
// games still on court can be scored or cancelled (no timer, swap or tools).
import { html } from '../../lib/html.js';
import { formatClock } from '../../lib/time-format.js';
import { showToast } from '../../lib/toast.js';
import { openDialog } from '../../lib/dialog.js';
import { updateSession } from '../../lib/sessions.js';
import { addCourt, renameCourt, toggleCourtPaused, MAX_COURTS, COURT_NAME_MAX } from '../../lib/session-model.js';
import { playingMatches, teamHtml, scoreDialog, swapDialog, cancelDialog, isEnded } from './floor.js';

function courtHtml(court, match, holding, live, ended) {
  const names = live?.names ?? {};
  return html`
    <article class="court ${match ? 'court--playing' : ''} ${court.paused ? 'court--paused' : ''}">
      <header class="court__head">
        <h2 class="court__name">${court.name}</h2>
        ${match && !ended ? html`<span class="court__timer num" data-since="${match.startedAt}"></span>` : ''}
        ${court.paused ? html`<span class="pill">Paused</span>` : ''}
      </header>
      ${match
        ? html`<div class="court__teams">${teamHtml(match, 'team1')}<span class="court__vs">vs</span>${teamHtml(match, 'team2')}</div>
            <div class="court__actions">
              <button type="button" class="btn btn--primary btn--sm" data-score="${match.mid}">Enter score</button>
              ${ended ? '' : html`<button type="button" class="btn btn--secondary btn--sm" data-swap="${match.mid}">Swap</button>`}
              <button type="button" class="btn btn--ghost btn--sm" data-cancel="${match.mid}">Cancel match</button>
            </div>`
        : html`<p class="court__empty">${court.paused ? 'Paused — no new games here.'
          : holding.length ? html`Winners waiting: ${holding.map((p) => names[p] ?? '?').join(' & ')}`
            : 'Waiting for players…'}</p>`}
      ${ended ? '' : html`<div class="court__tools">
        <button type="button" class="btn btn--ghost btn--sm" data-rename="${court.id}">Rename</button>
        <button type="button" class="btn btn--ghost btn--sm" data-pause="${court.id}">${court.paused ? 'Resume' : 'Pause'}</button>
      </div>`}
    </article>`;
}

function upNextHtml(live) {
  const next = (live?.queue ?? []).slice(0, 4).flatMap((q) => q.pids);
  if (!next.length) return html`<p class="page__sub">Nobody waiting. Mark players Here on the Players tab.</p>`;
  return html`<ol class="up-next">${next.map((pid) => html`<li>${live.names?.[pid] ?? '?'}</li>`)}</ol>`;
}

export function mount(panel, ctx) {
  panel.innerHTML = html`
    <div class="courts" data-courts></div>
    <section class="card up-next-card">
      <h2 class="card__title">Up next</h2>
      <div data-next></div>
    </section>
    <button type="button" class="btn btn--secondary btn--block" data-add>+ Add court</button>`;

  panel.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const match = (id) => ctx.matches.find((m) => m.mid === id);
    const courts = ctx.session.courts;
    const save = (next) => ctx.sync.track(updateSession(ctx.sid, { courts: next })).catch((err) => showToast(`Couldn't update courts: ${err.message}`, 'error'));
    if (t.dataset.score) scoreDialog(ctx, match(t.dataset.score));
    else if (t.dataset.swap) swapDialog(ctx, match(t.dataset.swap));
    else if (t.dataset.cancel) {
      const m = match(t.dataset.cancel);
      cancelDialog(ctx, m, courts.find((c) => c.id === m.courtId)?.name ?? 'Court');
    } else if (t.dataset.pause) save(toggleCourtPaused(courts, t.dataset.pause));
    else if (t.dataset.rename) {
      const court = courts.find((c) => c.id === t.dataset.rename);
      const values = await openDialog({
        title: 'Rename court',
        body: html`<label class="field"><span class="field__label">Court name</span><input class="input" name="name" maxlength="${COURT_NAME_MAX}" value="${court.name}"></label>`,
        validate: ({ name }) => (name.trim() ? null : 'Give the court a name.'),
      });
      if (values) save(renameCourt(ctx.session.courts, court.id, values.name));
    } else if (t.hasAttribute('data-add')) {
      if (courts.length >= MAX_COURTS) { showToast(`Up to ${MAX_COURTS} courts.`); return; }
      save(addCourt(courts));
    }
  });

  return {
    update(c) {
      const ended = isEnded(c);
      const byCourt = new Map(playingMatches(c.matches).map((m) => [m.courtId, m]));
      const holding = new Map((c.live?.courts ?? []).map((lc) => [lc.courtId, lc.holding ?? []]));
      panel.querySelector('[data-courts]').innerHTML = html`${c.session.courts.map((court) => courtHtml(court, byCourt.get(court.id), holding.get(court.id) ?? [], c.live, ended))}`;
      panel.querySelector('[data-next]').innerHTML = upNextHtml(c.live);
      panel.querySelector('[data-add]').hidden = ended;
      panel.querySelectorAll('[data-since]').forEach((el) => { el.textContent = formatClock(Date.now() - Number(el.dataset.since)); });
    },
  };
}
