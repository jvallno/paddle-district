// Public live view (#/tv/{sid}, spec §13.1) — v1's live view and a TV display.
// No sign-in: reads only public data (session, live/state, matches). Always
// dark; the topbar is hidden while it's open.
import { html, raw } from '../../lib/html.js';
import { formatClock, formatElapsed } from '../../lib/time-format.js';
import { appUrl } from '../../lib/app-url.js';
import { watchSession, watchLiveState, watchMatches } from '../../lib/sessions.js';
import { rankingsHtml } from '../shared/rankings-table.js';

const teamText = (names, pids) => pids.map((p) => names?.[p] ?? '?').join(' & ');

// Ended sessions: the host has stopped, so live/state is stale — show the games
// still on court straight from the match docs (they can still be scored or
// cancelled), with no ticking timers.
function endedCourts(session, matches) {
  const byCourt = new Map(matches.filter((m) => m.status === 'playing').map((m) => [m.courtId, m]));
  return session.courts.map((c) => {
    const m = byCourt.get(c.id);
    return { courtId: c.id, name: c.name, paused: c.paused, matchId: m?.mid ?? null, team1: m?.team1 ?? [], team2: m?.team2 ?? [], names: m?.names };
  });
}

function courtsHtml(live, session, matches) {
  const ended = session.status === 'ended';
  const courts = ended ? endedCourts(session, matches)
    : live?.courts ?? session.courts.map((c) => ({ courtId: c.id, name: c.name, paused: c.paused, team1: [], team2: [] }));
  return html`${courts.map((c) => html`
    <article class="tv-court ${c.matchId ? 'tv-court--playing' : ''}">
      <header class="tv-court__head"><h2>${c.name}</h2>${c.matchId && c.startedAt && !ended ? html`<span class="num" data-since="${c.startedAt}">${formatClock(Date.now() - c.startedAt)}</span>` : ''}</header>
      ${c.matchId
        ? html`<p class="tv-court__team tv-court__team--1">${teamText(c.names ?? live?.names, c.team1)}</p><p class="tv-court__vs">vs</p><p class="tv-court__team tv-court__team--2">${teamText(c.names ?? live?.names, c.team2)}</p>`
        : html`<p class="tv-court__empty">${c.paused ? 'Paused' : 'Waiting for players'}</p>`}
    </article>`)}`;
}

export function init(container, sid) {
  if (!sid) {
    container.innerHTML = html`<section class="tv"><h1 class="tv__title">Session not found</h1><p class="tv__sub">Check the link with your organizer.</p></section>`;
    return;
  }
  document.body.classList.add('tv-mode');
  const prevTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'dark';
  container.innerHTML = html`<section class="tv"><p class="tv__loading">Loading live view…</p></section>`;
  const root = container.querySelector('.tv');
  const data = { session: undefined, live: null, matches: [] };
  let drawn = false;
  let qrUrl = null;

  function draw() {
    const s = data.session;
    if (s === null) { root.innerHTML = html`<h1 class="tv__title">Session not found</h1><p class="tv__sub">Check the link with your organizer.</p>`; drawn = false; qrUrl = null; return; }
    if (!s) return;
    if (!drawn) {
      root.innerHTML = html`
        <header class="tv__head">
          <img class="tv__logo" src="/assets/logo-96.png" alt="" width="56" height="56">
          <div class="tv__heading"><h1 class="tv__title" data-name></h1><p class="tv__sub" data-meta></p></div>
          <span class="tv__clock num" data-clock></span>
        </header>
        <div class="tv__grid">
          <section class="tv__courts" data-courts aria-label="Courts"></section>
          <aside class="tv__side">
            <section class="tv-card" data-next-card><h2>Up next</h2><ol class="tv-next" data-next></ol></section>
            <section class="tv-card tv-card--qr" data-qr-card hidden><h2>Follow on your phone</h2><div class="tv__qr" data-qr></div></section>
            <section class="tv-card"><h2>Rankings</h2><div data-rank></div></section>
          </aside>
        </div>`;
      drawn = true;
    }
    root.querySelector('[data-name]').textContent = s.name;
    root.querySelector('[data-meta]').textContent = [s.venue, s.status === 'ended' ? 'Session ended' : null].filter(Boolean).join(' · ');
    document.title = `${s.name} · Live · Paddle District`;
    root.querySelector('[data-courts]').innerHTML = courtsHtml(data.live, s, data.matches);
    root.querySelector('[data-next-card]').hidden = s.status === 'ended';
    const next = (data.live?.queue ?? []).slice(0, 8).flatMap((q) => q.pids);
    root.querySelector('[data-next]').innerHTML = next.length
      ? html`${next.map((pid, i) => html`<li class="${i < 4 ? 'tv-next--soon' : ''}">${data.live.names?.[pid] ?? '?'}</li>`)}`
      : html`<li class="tv__sub">Nobody waiting</li>`;
    root.querySelector('[data-rank]').innerHTML = rankingsHtml(data.matches, 'wins', { limit: 10 });
    const qrCard = root.querySelector('[data-qr-card]');
    qrCard.hidden = !s.shareQr;
    const url = appUrl(window.location, `#/tv/${sid}`);
    if (s.shareQr && qrUrl !== url) {
      qrUrl = url;
      import('../../lib/qr.js').then(({ qrSvg }) => { root.querySelector('[data-qr]').innerHTML = html`${raw(qrSvg(url))}`; }).catch(() => { qrUrl = null; });
    }
  }

  // A watcher error (e.g. no connection, permission) replaces the view with a retry.
  let failed = false;
  function showError() {
    if (failed) return;
    failed = true;
    unsubs.forEach((u) => u());
    root.innerHTML = html`<h1 class="tv__title">Can't load the live view</h1><p class="tv__sub">Check the connection, then try again.</p><button type="button" class="btn btn--primary" data-retry>Try again</button>`;
    root.querySelector('[data-retry]').addEventListener('click', () => window.location.reload());
  }
  const unsubs = [];
  unsubs.push(
    watchSession(sid, (s, err) => { if (err) showError(); else if (!failed) { data.session = s; draw(); } }),
    watchLiveState(sid, (st, err) => { if (err) showError(); else if (!failed) { data.live = st; draw(); } }),
    watchMatches(sid, (list, err) => { if (err) showError(); else if (!failed) { data.matches = list; draw(); } }),
  );
  const tick = setInterval(() => {
    const s = data.session;
    const clock = root.querySelector('[data-clock]');
    if (clock && s?.startedAt) clock.textContent = formatElapsed((s.endedAt ?? Date.now()) - s.startedAt);
    root.querySelectorAll('[data-since]').forEach((el) => { el.textContent = formatClock(Date.now() - Number(el.dataset.since)); });
  }, 1000);

  container.addEventListener('view:teardown', () => {
    unsubs.forEach((u) => u());
    clearInterval(tick);
    document.body.classList.remove('tv-mode');
    document.documentElement.dataset.theme = prevTheme;
  }, { once: true });
}
