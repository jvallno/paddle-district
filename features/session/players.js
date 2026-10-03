// Players tab: paste a roster / add names, Here · On hold · Left, and the
// queue order with "Up next" (v1 parity).
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { parseNames, dedupeNames } from '../../lib/roster-parse.js';
import { addGuests, setParticipantStatus, setManyStatus } from '../../lib/sessions.js';
import { playingMatches, isEnded } from './floor.js';

const STATUSES = [['here', 'Here'], ['break', 'On hold'], ['left', 'Left']];

function rowHtml(p, where, ended) {
  return html`
    <li class="player-row player-row--${p.status}">
      <span class="player-row__name">${p.displayName}${where ? html` <span class="player-row__where">${where}</span>` : ''}</span>
      <span class="seg" role="group" aria-label="${p.displayName} status">
        ${STATUSES.map(([value, label]) => html`<button type="button" class="seg__btn" data-pid="${p.pid}" data-status="${value}" aria-pressed="${p.status === value}" ${ended ? 'disabled' : ''}>${label}</button>`)}
      </span>
    </li>`;
}

export function mount(panel, ctx) {
  panel.innerHTML = html`
    <form class="card roster-form" data-roster novalidate>
      <label class="field">
        <span class="field__label">Add players</span>
        <textarea class="input roster-form__text" name="names" rows="4" placeholder="Paste your list — one name per line"></textarea>
        <span class="field__hint">Numbering, headers and @mentions from a group-chat list are ignored. Names already here are skipped.</span>
      </label>
      <label class="check"><input type="checkbox" name="here" checked> Mark everyone here</label>
      <button class="btn btn--primary" type="submit">Add players</button>
    </form>
    <section class="card">
      <div class="players__head">
        <h2 class="card__title" data-count>Players</h2>
        <span class="players__bulk">
          <button type="button" class="btn btn--ghost btn--sm" data-all="here">All here</button>
          <button type="button" class="btn btn--ghost btn--sm" data-all="break">All on hold</button>
        </span>
      </div>
      <ul class="player-list" data-list></ul>
    </section>
    <section class="card">
      <h2 class="card__title">Queue</h2>
      <ol class="queue-list" data-queue></ol>
    </section>`;

  const form = panel.querySelector('[data-roster]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { add, skipped } = dedupeNames(parseNames(form.elements.names.value), ctx.participants.map((p) => p.displayName));
    if (!add.length) { showToast(skipped ? 'Everyone on that list is already here.' : 'No names found — one name per line.'); return; }
    ctx.sync.track(addGuests(ctx.sid, add, form.elements.here.checked ? 'here' : 'break'))
      .catch((err) => showToast(`Couldn't add players: ${err.message}`, 'error'));
    form.elements.names.value = '';
    showToast(skipped ? `${add.length} added, ${skipped} skipped (already here).` : `${add.length} player${add.length > 1 ? 's' : ''} added.`, 'success');
  });

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const fail = (err) => showToast(`Couldn't update: ${err.message}`, 'error');
    if (btn.dataset.pid) {
      if (btn.getAttribute('aria-pressed') === 'true') return;
      ctx.sync.track(setParticipantStatus(ctx.sid, btn.dataset.pid, btn.dataset.status)).catch(fail);
    } else if (btn.dataset.all) {
      const pids = ctx.participants.filter((p) => p.status !== 'left' && p.status !== btn.dataset.all).map((p) => p.pid);
      if (pids.length) ctx.sync.track(setManyStatus(ctx.sid, pids, btn.dataset.all)).catch(fail);
    }
  });

  return {
    update(c) {
      const ended = isEnded(c);
      form.hidden = ended;
      panel.querySelector('.players__bulk').hidden = ended;
      const courtName = new Map(c.session.courts.map((ct) => [ct.id, ct.name]));
      const where = new Map();
      playingMatches(c.matches).forEach((m) => [...m.team1, ...m.team2].forEach((pid) => where.set(pid, `Playing · ${courtName.get(m.courtId) ?? ''}`)));
      const queue = (c.live?.queue ?? []).flatMap((q) => q.pids);
      queue.forEach((pid, i) => { if (!where.has(pid)) where.set(pid, i < 4 ? 'Up next' : `#${i + 1} in line`); });
      const list = [...c.participants].sort((a, b) => (a.checkedInAt ?? 0) - (b.checkedInAt ?? 0));
      const count = (s) => list.filter((p) => p.status === s).length;
      panel.querySelector('[data-count]').textContent = `Players · ${count('here')} here · ${count('break')} on hold`;
      panel.querySelector('[data-list]').innerHTML = list.length
        ? html`${list.map((p) => rowHtml(p, p.status === 'here' ? where.get(p.pid) : null, ended))}`
        : html`<li class="page__sub">No players yet — paste your list above.</li>`;
      panel.querySelector('[data-queue]').innerHTML = queue.length
        ? html`${queue.map((pid, i) => html`<li class="${i < 4 ? 'queue-list__next' : ''}">${c.live.names?.[pid] ?? '?'}</li>`)}`
        : html`<li class="page__sub">Nobody waiting.</li>`;
    },
  };
}
