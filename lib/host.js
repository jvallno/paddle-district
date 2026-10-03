// The host device (spec §5.6, §13.4). Any organizer device with a live session
// open runs startHost(): it claims the lease when it's free, renews it every
// BEAT_MS (lease claim/renew/release use small guarded transactions, spec §5.6
// exception), and while it holds the lease runs the engine on every change and
// commits new matches + live/state. Browser only; decisions live in
// lib/host-lease.js and lib/host-step.js (both node-tested).
import { db } from './firebase.js';
import { doc, runTransaction, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { BEAT_MS, leaseState, claimHost } from './host-lease.js';
import { hostStep } from './host-step.js';

// One id per tab, so two tabs on one laptop never both host.
const DEVICE_ID = `d_${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
export const deviceId = () => DEVICE_ID;

// onStatus('host' | 'waiting' | 'other' | 'stopped', info) for the UI;
// onError(err) for engine/commit failures (shown as a toast).
// Call feed({ session, participants, matches }) on every snapshot; stop() on teardown.
export function startHost({ sid, uid, onStatus, onError }) {
  const sessionRef = doc(db, 'sessions', sid);
  let data = { session: null, participants: null, matches: null };
  let lastKey = null;
  let claiming = false;
  let stopped = false;
  let status = null;
  let failures = 0;
  let retryAt = 0;

  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s, data.session?.host ?? null); } };

  async function claim() {
    if (claiming) return;
    claiming = true;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sessionRef);
        const s = snap.data();
        if (!s || s.status !== 'live' || leaseState(s.host, DEVICE_ID, Date.now()) === 'taken') return;
        tx.update(sessionRef, { host: claimHost(s.host, DEVICE_ID, uid, Date.now()) });
      });
    } catch (err) {
      if (err?.code !== 'unavailable' && err?.code !== 'failed-precondition') onError?.(err);
    } finally {
      claiming = false;
    }
  }

  function run() {
    const { session, participants, matches } = data;
    if (stopped || !session || !participants || !matches) return;
    if (session.status !== 'live') { setStatus('stopped'); return; }
    const lease = leaseState(session.host, DEVICE_ID, Date.now());
    if (lease === 'free') { setStatus('waiting'); claim(); return; }
    if (lease === 'taken') { lastKey = null; setStatus('other'); return; }
    setStatus('host');
    if (failures > 0 && Date.now() < retryAt) return;
    try {
      const out = hostStep({ session, participants, matches, now: Date.now(), deviceId: DEVICE_ID, lastKey });
      if (!out.write) return;
      lastKey = out.stateKey;
      const batch = writeBatch(db);
      out.matches.forEach(({ mid, data: m }) => batch.set(doc(db, 'sessions', sid, 'matches', mid), m));
      batch.set(doc(db, 'sessions', sid, 'live', 'state'), out.state);
      batch.commit().then(() => { failures = 0; }).catch((err) => {
        failures += 1;
        retryAt = Date.now() + Math.min(60000, BEAT_MS * 2 ** (failures - 1));
        lastKey = null;
        onError?.(err);
      });
    } catch (err) {
      onError?.(err); // engine bug: keep the last good live/state
    }
  }

  function renew() {
    runTransaction(db, async (tx) => {
      const s = (await tx.get(sessionRef)).data();
      if (s?.host?.deviceId === DEVICE_ID) tx.update(sessionRef, { 'host.beatAt': Date.now() });
    }).catch(() => {}); // offline/contention: the lease lapses after LEASE_MS, as intended
  }

  // Renew the lease while we hold it; re-check a free lease on the same beat.
  const beat = setInterval(() => {
    const s = data.session;
    if (stopped || !s || s.status !== 'live') return;
    const lease = leaseState(s.host, DEVICE_ID, Date.now());
    if (lease === 'mine') {
      renew();
      if (lastKey === null) run();
    } else run();
  }, BEAT_MS);

  function release() {
    if (leaseState(data.session?.host, DEVICE_ID, Date.now()) !== 'mine') return;
    runTransaction(db, async (tx) => {
      const s = (await tx.get(sessionRef)).data();
      if (s?.host?.deviceId === DEVICE_ID) tx.update(sessionRef, { host: null });
    }).catch(() => {});
  }
  window.addEventListener('pagehide', release);

  return {
    feed(patch) { data = { ...data, ...patch }; run(); },
    // Hand the lease back on the way out so another device can take over at once.
    stop() {
      stopped = true;
      clearInterval(beat);
      window.removeEventListener('pagehide', release);
      release();
    },
  };
}
