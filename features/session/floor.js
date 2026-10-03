// Shared helpers for the session tabs: who is where, and the score / swap /
// cancel dialogs. Writes go through lib/sessions.js and ctx.sync.track().
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { openDialog } from '../../lib/dialog.js';
import { validateScore } from '../../lib/score-flow.js';
import { scoreMatch, swapInMatch, cancelGame } from '../../lib/sessions.js';

export const playingMatches = (matches) => matches.filter((m) => m.status === 'playing');
export const busyPids = (matches) => new Set(playingMatches(matches).flatMap((m) => [...m.team1, ...m.team2]));
export const nameIn = (ctx, pid) => ctx.participants.find((p) => p.pid === pid)?.displayName ?? '?';
export const matchName = (m, pid) => m.names?.[pid] ?? '?';
export const isEnded = (ctx) => ctx.session.status === 'ended';

const WARN = { 'zero-zero': '0–0 is unusual.', tie: 'A tie means nobody wins.', 'win-by-one': 'Winning by 1 is unusual.' };
const report = (what) => (err) => showToast(`Couldn't ${what}: ${err.message}`, 'error');

export function teamHtml(m, team) {
  return html`<span class="team team--${team === 'team1' ? 1 : 2}">${m[team].map((pid, i) => html`${i ? html`<span class="team__amp"> &amp; </span>` : ''}<span>${matchName(m, pid)}</span>`)}</span>`;
}

// Enter or edit a score. Unusual scores warn once; Save again to confirm.
export async function scoreDialog(ctx, match) {
  let warned = null;
  const values = await openDialog({
    title: match.score ? 'Edit score' : 'Enter score',
    submitLabel: 'Save score',
    body: html`
      <div class="score-form">
        <label class="field score-form__team">
          <span class="field__label">${match.team1.map((p) => matchName(match, p)).join(' & ')}</span>
          <input class="input score-form__input num" name="t1" type="number" min="0" max="99" step="1" inputmode="numeric" value="${match.score?.t1 ?? ''}" required>
        </label>
        <span class="score-form__vs" aria-hidden="true">–</span>
        <label class="field score-form__team">
          <span class="field__label">${match.team2.map((p) => matchName(match, p)).join(' & ')}</span>
          <input class="input score-form__input num" name="t2" type="number" min="0" max="99" step="1" inputmode="numeric" value="${match.score?.t2 ?? ''}" required>
        </label>
      </div>`,
    validate: ({ t1, t2 }) => {
      const a = t1 === '' ? NaN : Number(t1);
      const b = t2 === '' ? NaN : Number(t2);
      const v = validateScore(a, b);
      if (!v.ok) return 'Scores are whole numbers from 0 to 99.';
      const key = `${a}-${b}`;
      if (v.warnings.length && warned !== key) {
        warned = key;
        return `${v.warnings.map((w) => WARN[w]).join(' ')} Tap Save score again to keep it.`;
      }
      return null;
    },
  });
  if (!values) return;
  ctx.sync.track(scoreMatch(ctx.sid, match, ctx.uid, { t1: Number(values.t1), t2: Number(values.t2) })).catch(report('save the score'));
}

export async function swapDialog(ctx, match) {
  const busy = busyPids(ctx.matches);
  const bench = ctx.participants.filter((p) => p.status === 'here' && !busy.has(p.pid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!bench.length) { showToast('Nobody is free to swap in — mark someone Here first.'); return; }
  const values = await openDialog({
    title: 'Swap a player',
    submitLabel: 'Swap',
    body: html`
      <fieldset class="field dialog__choices">
        <legend class="field__label">Take off</legend>
        ${[...match.team1, ...match.team2].map((pid, i) => html`
          <label class="choice"><input type="radio" name="out" value="${pid}" ${i === 0 ? 'checked' : ''}><span>${matchName(match, pid)}</span></label>`)}
      </fieldset>
      <label class="field">
        <span class="field__label">Put on</span>
        <select class="input" name="in">${bench.map((p) => html`<option value="${p.pid}">${p.displayName}</option>`)}</select>
      </label>`,
  });
  if (!values) return;
  const inName = bench.find((p) => p.pid === values.in)?.displayName ?? '?';
  ctx.sync.track(swapInMatch(ctx.sid, match, values.out, values.in, inName, busy)).catch(report('swap'));
}

export async function cancelDialog(ctx, match, courtName) {
  const names = [...match.team1, ...match.team2].map((p) => matchName(match, p)).join(', ');
  const values = await openDialog({
    title: 'Cancel match',
    submitLabel: 'Cancel this match',
    danger: true,
    body: html`
      <p class="modal__message">${courtName}: ${names}. No score will be recorded.</p>
      <fieldset class="field dialog__choices">
        <legend class="field__label">Players</legend>
        <label class="choice"><input type="radio" name="fate" value="queue" checked><span>Back to the queue <span class="choice__hint">They go to the back of the line.</span></span></label>
        <label class="choice"><input type="radio" name="fate" value="hold"><span>Put them On hold <span class="choice__hint">They stay in the session but off the queue.</span></span></label>
      </fieldset>`,
  });
  if (!values) return;
  ctx.sync.track(cancelGame(ctx.sid, match, values.fate)).catch(report('cancel the match'));
}
