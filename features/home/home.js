// My Sessions (#/home, spec §13.1): sessions I organize — live → upcoming →
// past — plus Create session and delete (owner only).
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { showToast } from '../../lib/toast.js';
import { showConfirm } from '../../lib/confirm.js';
import { watchMySessions, deleteSession } from '../../lib/sessions.js';
import { groupSessions, localDate } from '../../lib/session-model.js';

const RULE_LABELS = { everyoneOff: 'Everyone off', winnersStay: 'Winners stay', winnersSplit: 'Winners split' };

function prettyDate(date) {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function rowHtml(s, uid) {
  return html`
    <li class="session-row">
      <a class="session-row__main" href="#/s/${s.id}">
        <span class="session-row__name">${s.name}</span>
        <span class="session-row__meta">${prettyDate(s.date)}${s.venue ? html` · ${s.venue}` : ''} · ${s.courts?.length ?? 0} courts · ${RULE_LABELS[s.courtRule?.type] ?? ''}</span>
      </a>
      ${s.ownerId === uid ? html`<button type="button" class="btn btn--ghost btn--sm" data-delete="${s.id}" aria-label="Delete ${s.name}">Delete</button>` : ''}
    </li>`;
}

function groupHtml(title, list, uid, extraClass = '') {
  if (!list.length) return '';
  return html`
    <section class="home__group ${extraClass}">
      <h2 class="eyebrow">${title}</h2>
      <ul class="session-list">${list.map((s) => rowHtml(s, uid))}</ul>
    </section>`;
}

export function init(container) {
  const { profile, user } = getSession();
  container.innerHTML = html`
    <section class="page home">
      <div class="home__head">
        <div class="home__hello">
          <p class="eyebrow">Hi, ${profile.displayName}</p>
          <h1 class="page__title">My sessions</h1>
        </div>
        <a class="btn btn--primary" href="#/new">+ New session</a>
      </div>
      <div data-list><p class="page__sub">Loading your sessions…</p></div>
      <a class="btn btn--secondary btn--block" href="#/me">Show my player card</a>
    </section>`;

  const listEl = container.querySelector('[data-list]');
  let sessions = [];
  const unsub = watchMySessions(user.uid, (list, err) => {
    if (err) { listEl.innerHTML = html`<p class="field__error">Couldn't load your sessions: ${err.message}</p>`; return; }
    sessions = list;
    if (!list.length) {
      listEl.innerHTML = html`
        <div class="card home__empty">
          <span class="home__empty-icon" aria-hidden="true">🏓</span>
          <h2 class="card__title">No sessions yet</h2>
          <p class="page__sub">Create one for tonight's open play — paste your player list and the courts fill themselves.</p>
          <a class="btn btn--accent" href="#/new">Create your first session</a>
        </div>`;
      return;
    }
    const g = groupSessions(list, localDate(new Date()));
    listEl.innerHTML = html`
      ${groupHtml('Live now', g.live, user.uid, 'home__group--live')}
      ${groupHtml('Upcoming', g.upcoming, user.uid)}
      ${groupHtml('Past', g.past, user.uid)}`;
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    const s = sessions.find((x) => x.id === btn.dataset.delete);
    const ok = await showConfirm({
      title: `Delete “${s?.name ?? 'session'}”?`,
      message: 'This removes its players, games and rankings for good. Export it first if you want to keep a copy.',
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
      await deleteSession(btn.dataset.delete);
      showToast('Session deleted.', 'success');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Delete';
      showToast(`Couldn't delete — check your connection. (${err.message})`, 'error');
    }
  });

  container.addEventListener('view:teardown', unsub, { once: true });
}
