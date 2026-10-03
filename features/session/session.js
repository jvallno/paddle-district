// Organizer session view (#/s/{sid}, spec §13.1). Watches the session, its
// players, games and live state; runs the host on this device; renders one
// tab at a time. Tabs live in sibling modules and export
// mount(panel, ctx) → { update(ctx) }.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { showToast } from '../../lib/toast.js';
import { formatElapsed, formatClock } from '../../lib/time-format.js';
import { createSyncStatus } from '../../lib/sync-status.js';
import { appUrl } from '../../lib/app-url.js';
import { watchSession, watchParticipants, watchMatches, watchLiveState, continueSession } from '../../lib/sessions.js';
import { startHost } from '../../lib/host.js';
import * as courtsTab from './courts.js';
import * as playersTab from './players.js';
import * as scoresTab from './scores.js';
import * as rankingsTab from './rankings.js';
import * as settingsTab from './settings.js';

const TABS = [
  ['courts', 'Courts', courtsTab],
  ['players', 'Players', playersTab],
  ['scores', 'Scores', scoresTab],
  ['rankings', 'Rankings', rankingsTab],
  ['settings', 'Settings', settingsTab],
];
const HOST_TEXT = {
  host: 'This device is running the queue',
  waiting: 'Starting the queue…',
  other: 'Queue run by your other device',
  stopped: 'Session ended — queue stopped',
};
const SYNC_TEXT = { saved: 'Saved', syncing: 'Syncing…', offline: 'Offline — changes will sync' };

const notFoundHtml = () => html`
  <h1 class="page__title">Session not found</h1>
  <p class="page__sub">It may have been deleted, or the link is incomplete.</p>
  <a class="btn btn--primary" href="#/home">Back to my sessions</a>`;

export function init(container, sid) {
  if (!sid) { container.innerHTML = html`<section class="page page--wide session">${notFoundHtml()}</section>`; return; }
  const { user } = getSession();
  container.innerHTML = html`<section class="page page--wide session"><p class="page__sub">Loading session…</p></section>`;
  const root = container.querySelector('.session');
  const ctx = { sid, uid: user.uid, session: undefined, participants: null, matches: null, live: null, sync: null };
  const unsubs = [];
  let host = null;
  let tabs = null; // { id → { panel, view } } once the shell is drawn
  let active = 'courts';

  const sync = createSyncStatus((s) => {
    const el = root.querySelector('[data-sync]');
    if (el) { el.dataset.state = s; el.textContent = SYNC_TEXT[s]; }
  }, { online: navigator.onLine });
  ctx.sync = sync;
  const onOnline = () => sync.setOnline(navigator.onLine);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOnline);

  function drawShell() {
    root.innerHTML = html`
      <header class="session__head">
        <div class="session__title">
          <p class="eyebrow" data-meta></p>
          <h1 class="page__title" data-name></h1>
        </div>
        <div class="session__status">
          <span class="session__clock num" data-clock>00:00:00</span>
          <span class="sync-dot" data-sync data-state="${sync.state()}">${SYNC_TEXT[sync.state()]}</span>
        </div>
      </header>
      <div class="session__banner" data-banner hidden></div>
      <nav class="tabs" role="tablist" aria-label="Session sections">
        ${TABS.map(([id, label]) => html`<button type="button" role="tab" class="tabs__tab" id="tab-${id}" data-tab="${id}" aria-controls="panel-${id}" aria-selected="${id === active}">${label}</button>`)}
      </nav>
      ${TABS.map(([id]) => html`<div class="tabs__panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${id === active ? '' : 'hidden'}></div>`)}`;
    tabs = Object.fromEntries(TABS.map(([id, , mod]) => [id, { panel: root.querySelector(`#panel-${id}`), mod, view: null }]));
    root.querySelector('.tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) select(btn.dataset.tab);
    });
    root.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.findIndex(([id]) => id === active);
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
      select(next);
      root.querySelector(`#tab-${next}`).focus();
    });
  }

  function select(id) {
    active = id;
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    Object.entries(tabs).forEach(([tid, t]) => { t.panel.hidden = tid !== id; });
    render();
  }

  function renderHead() {
    const s = ctx.session;
    root.querySelector('[data-name]').textContent = s.name;
    root.querySelector('[data-meta]').textContent = [s.date, s.venue, s.status === 'ended' ? 'Ended' : 'Live'].filter(Boolean).join(' · ');
    document.title = `${s.name} · Paddle District`;
  }

  function renderBanner(hostStatus) {
    const el = root.querySelector('[data-banner]');
    const s = ctx.session;
    if (s.status === 'ended') {
      el.hidden = false;
      el.className = 'session__banner session__banner--ended';
      el.innerHTML = html`<span>Session ended. Scores can still be fixed.</span><button type="button" class="btn btn--sm btn--accent" data-continue>Continue session</button>`;
      return;
    }
    el.hidden = false;
    el.className = `session__banner session__banner--${hostStatus ?? 'waiting'}`;
    el.textContent = HOST_TEXT[hostStatus ?? 'waiting'];
  }

  function render() {
    if (!tabs || !ctx.session || !ctx.participants || !ctx.matches) return;
    renderHead();
    const t = tabs[active];
    if (!t.view) t.view = t.mod.mount(t.panel, ctx);
    t.view.update(ctx);
  }

  let hostStatus = null;
  function onData(patch) {
    Object.assign(ctx, patch);
    if (ctx.session === null) {
      // Deleted (or not cached yet while offline): stop the host so nothing
      // writes or toasts, but keep watching — if the session shows up after
      // all, the `!tabs` path below redraws the view and restarts the host.
      host?.stop();
      host = null;
      tabs = null;
      root.innerHTML = notFoundHtml();
      return;
    }
    if (!ctx.session) return;
    if (!ctx.session.organizerIds?.includes(user.uid)) { showNotOrganizer(); return; }
    if (!tabs) { drawShell(); startHosting(); }
    host?.feed({ session: ctx.session, participants: ctx.participants, matches: ctx.matches });
    renderBanner(hostStatus);
    render();
  }

  function showNotOrganizer() {
    stopAll();
    root.innerHTML = html`
      <p class="eyebrow">${ctx.session.name}</p>
      <h1 class="page__title">Only organizers can run this session</h1>
      <p class="page__sub">You can still follow the courts, queue and rankings live.</p>
      <a class="btn btn--primary" href="${appUrl(window.location, `#/tv/${sid}`)}">Open the live view</a>`;
  }

  function startHosting() {
    host = startHost({
      sid,
      uid: user.uid,
      onStatus: (s) => { hostStatus = s; if (ctx.session) renderBanner(s); },
      onError: (err) => showToast(`Queue problem: ${err.message}`, 'error'),
    });
  }

  const fail = (what) => (err) => showToast(`Couldn't load ${what}: ${err.message}`, 'error');
  unsubs.push(watchSession(sid, (s, err) => (err ? fail('the session')(err) : onData({ session: s }))));
  unsubs.push(watchParticipants(sid, (list, err) => (err ? fail('players')(err) : onData({ participants: list }))));
  unsubs.push(watchMatches(sid, (list, err) => (err ? fail('games')(err) : onData({ matches: list }))));
  unsubs.push(watchLiveState(sid, (state, err) => (err ? fail('the queue')(err) : onData({ live: state }))));

  // Continue (banner button) — delegated so the banner can re-render freely.
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-continue]')) return;
    sync.track(continueSession(sid)).catch((err) => showToast(`Couldn't continue: ${err.message}`, 'error'));
  });

  // One ticker for the session clock and every court timer.
  const tick = setInterval(() => {
    const s = ctx.session;
    const clock = root.querySelector('[data-clock]');
    if (clock && s?.startedAt) clock.textContent = formatElapsed((s.endedAt ?? Date.now()) - s.startedAt);
    root.querySelectorAll('[data-since]').forEach((el) => { el.textContent = formatClock(Date.now() - Number(el.dataset.since)); });
  }, 1000);

  function stopAll() {
    unsubs.splice(0).forEach((u) => u());
    host?.stop();
    host = null;
  }
  container.addEventListener('view:teardown', () => {
    stopAll();
    clearInterval(tick);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOnline);
  }, { once: true });
}
