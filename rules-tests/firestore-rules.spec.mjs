// Firestore security-rules tests — run against the local emulator, never the
// live project. Every rules change keeps all "attack" cases denied and all
// "normal use" cases allowed.
//   npm run test:rules            (from the repo root; needs Java 21+)
// Named *.spec.mjs so the root `npm test` (pure unit tests) doesn't pick it up.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, limit,
  writeBatch, serverTimestamp,
} from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});
after(async () => { await env.cleanup(); });

// ana already has a profile; ben is signed in but hasn't set one up yet.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users/ana'), { displayName: 'Ana', handle: 'ana', photoURL: '', selfRating: 3.5, createdAt: new Date(0) });
    await setDoc(doc(db, 'handles/ana'), { uid: 'ana' });
  });
});

const as = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const asPassword = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const profile = (over = {}) => ({ displayName: 'Ben', handle: 'ben', photoURL: '', selfRating: 3, createdAt: serverTimestamp(), ...over });

// Profile setup = one batch: claim the handle + create the profile.
function setup(db, uid, data = profile(), handle = data.handle, claimUid = uid) {
  const b = writeBatch(db);
  b.set(doc(db, `handles/${handle}`), { uid: claimUid });
  b.set(doc(db, `users/${uid}`), data);
  return b.commit();
}

// ── Attacks: must all be DENIED ─────────────────────────────────────────────
test('attack: read profiles signed out', async () => {
  await assertFails(getDoc(doc(anon(), 'users/ana')));
});
test('attack: look up a handle signed out', async () => {
  await assertFails(getDoc(doc(anon(), 'handles/ana')));
});
test('attack: list all handles', async () => {
  await assertFails(getDocs(collection(as('ben'), 'handles')));
});
test('attack: create a profile for someone else', async () => {
  await assertFails(setup(as('ben'), 'carl', profile({ handle: 'carl' })));
});
test('attack: create a profile without claiming the handle', async () => {
  await assertFails(setDoc(doc(as('ben'), 'users/ben'), profile()));
});
test('attack: claim a handle without creating the profile', async () => {
  await assertFails(setDoc(doc(as('ben'), 'handles/ben'), { uid: 'ben' }));
});
test("attack: take someone else's handle", async () => {
  await assertFails(setup(as('ben'), 'ben', profile({ handle: 'ana' })));
});
test('attack: claim a handle pointing at another account', async () => {
  await assertFails(setup(as('ben'), 'ben', profile(), 'ben', 'ana'));
});
test('attack: claim a second handle after setup', async () => {
  await assertFails(setDoc(doc(as('ana'), 'handles/ana2'), { uid: 'ana' }));
});
test('attack: change your own handle', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { handle: 'queen' }));
});
test("attack: edit someone else's profile", async () => {
  await assertFails(updateDoc(doc(as('ben'), 'users/ana'), { displayName: 'Hacked' }));
});
test('attack: self-award a badge', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { badges: { rating: true } }));
});
test('attack: invalid fields on setup', async () => {
  for (const bad of [
    { selfRating: 9 }, { selfRating: 1.5 }, { selfRating: 3.3 }, { selfRating: '3' },
    { displayName: '' }, { displayName: '   ' }, { displayName: 'x'.repeat(41) }, { handle: 'Ben', displayName: 'Ben' },
    { createdAt: new Date(0) },
    { photoURL: 'http://x/p.png' }, { photoURL: 'javascript:alert(1)' }, { photoURL: 'https://' + 'x'.repeat(1000) },
    { photoURL: 'https://tracker.example/pixel.gif' }, { displayName: '\u202Eana\u200B' },
  ]) {
    const data = profile(bad);
    await assertFails(setup(as('ben'), 'ben', data, data.handle), JSON.stringify(bad));
  }
});
test('attack: update photoURL to a tracker URL', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { photoURL: 'https://tracker.example/pixel.gif' }));
});
test('attack: list all profiles without a limit', async () => {
  await assertFails(getDocs(collection(as('ben'), 'users')));
});
test('attack: list profiles with limit over 25', async () => {
  await assertFails(getDocs(query(collection(as('ben'), 'users'), limit(26))));
});
test('attack: invalid rating on update', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { selfRating: 8.5 }));
});
test('attack: rewrite createdAt', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { createdAt: new Date(5) }));
});
test('attack: delete a profile or free a handle', async () => {
  await assertFails(deleteDoc(doc(as('ana'), 'users/ana')));
  await assertFails(deleteDoc(doc(as('ana'), 'handles/ana')));
});
test('attack: repoint a handle', async () => {
  await assertFails(setDoc(doc(as('ana'), 'handles/ana'), { uid: 'ben' }));
});
test('attack: malformed session doc; results not open yet', async () => {
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1'), { ownerId: 'ana' }));
  await assertFails(getDoc(doc(as('ana'), 'results/r1')));
});
test('attack: non-Google account reads or sets up a profile', async () => {
  await assertFails(getDoc(doc(asPassword('ben'), 'users/ana')));
  await assertFails(setup(asPassword('ben'), 'ben'));
});
test('attack: claim two handles in the setup batch', async () => {
  const db = as('ben');
  const b = writeBatch(db);
  b.set(doc(db, 'handles/ben'), { uid: 'ben' });
  b.set(doc(db, 'handles/ben2'), { uid: 'ben' });
  b.set(doc(db, 'users/ben'), profile());
  await assertFails(b.commit());
});
test('attack: add an extra field on update', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { uid: 'ana' }));
});
test('attack: handle doc with an extra key', async () => {
  const db = as('ben');
  const b = writeBatch(db);
  b.set(doc(db, 'handles/ben'), { uid: 'ben', x: 1 });
  b.set(doc(db, 'users/ben'), profile());
  await assertFails(b.commit());
});
test('attack: handle doc id that is not a valid handle', async () => {
  const db = as('ben');
  const b = writeBatch(db);
  b.set(doc(db, 'handles/AB'), { uid: 'ben' });
  b.set(doc(db, 'users/ben'), profile({ handle: 'ab' }));
  await assertFails(b.commit());
});

// ── Normal use: must all be ALLOWED ─────────────────────────────────────────
test('new player sets up a profile and claims a handle', async () => {
  await assertSucceeds(setup(as('ben'), 'ben'));
});
test('ratings on the half-point grid from 2 to 8 are accepted', async () => {
  await assertSucceeds(setup(as('ben'), 'ben', profile({ selfRating: 2 })));
  for (const r of [2.5, 4, 7.5, 8]) await assertSucceeds(updateDoc(doc(as('ben'), 'users/ben'), { selfRating: r }));
});
test('player edits name, photo and rating', async () => {
  await assertSucceeds(updateDoc(doc(as('ana'), 'users/ana'), { displayName: 'Ana R.', photoURL: 'https://lh3.googleusercontent.com/a/p.png', selfRating: 4 }));
});
test('signed-in player reads profiles and looks up a handle', async () => {
  await assertSucceeds(getDoc(doc(as('ben'), 'users/ana')));
  await assertSucceeds(getDoc(doc(as('ben'), 'handles/ana')));
  await assertSucceeds(getDoc(doc(as('ben'), 'handles/nobody')));
});
test('signed-in player can query profiles by handle', async () => {
  await assertSucceeds(getDocs(query(collection(as('ben'), 'users'), where('handle', '==', 'ana'), limit(1))));
});
test('search profiles with a limit of 25', async () => {
  await assertSucceeds(getDocs(query(collection(as('ben'), 'users'), where('handle', '>=', 'a'), where('handle', '<', 'b'), limit(25))));
});

// ── Sessions (spec §13.5) ───────────────────────────────────────────────────
// ana owns session s1 (with a guest g_ana1 and a live game c1_1); carl is a
// signed-in stranger; anon is the public TV view.
const sessionData = (over = {}) => ({
  name: 'Sat Open', date: '2026-10-04', venue: 'Elm', ownerId: 'ana', organizerIds: ['ana'],
  courts: [{ id: 'c1', name: 'Court 1', paused: false }], mode: 'fairness',
  courtRule: { type: 'everyoneOff', maxWins: 2 }, guestsAllowed: true, status: 'live', host: null,
  shareQr: true, startedAt: 1000, endedAt: null, createdAt: serverTimestamp(), ...over,
});
const guest = (over = {}) => ({ uid: null, isGuest: true, displayName: 'Dana', selfRating: null, status: 'here', checkedInAt: 1, clientAt: 1, ...over });
const game = (over = {}) => ({
  courtId: 'c1', team1: ['g_ana1', 'g_ana2'], team2: ['g_ana3', 'g_ana4'], names: {}, startedAt: 2000,
  endedAt: null, score: null, status: 'playing', streaks: {}, clientAt: 2000, ...over,
});

async function seedSession() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'sessions/s1'), sessionData({ createdAt: new Date(0) }));
    await setDoc(doc(db, 'sessions/s1/participants/g_ana1'), guest());
    await setDoc(doc(db, 'sessions/s1/matches/c1_1'), game());
    await setDoc(doc(db, 'sessions/s1/live/state'), { courts: [], queue: [], names: {} });
  });
}

test('attack: list sessions you do not organize', async () => {
  await seedSession();
  await assertFails(getDocs(collection(as('carl'), 'sessions')));
  await assertFails(getDocs(query(collection(anon(), 'sessions'), where('organizerIds', 'array-contains', 'ana'))));
});
test('attack: create a session owned by someone else or with extra organizers', async () => {
  await assertFails(setDoc(doc(as('carl'), 'sessions/s2'), sessionData()));
  await assertFails(setDoc(doc(as('carl'), 'sessions/s2'), sessionData({ ownerId: 'carl', organizerIds: ['carl', 'ana'] })));
  await assertFails(setDoc(doc(anon(), 'sessions/s2'), sessionData({ ownerId: 'carl', organizerIds: ['carl'] })));
});
test('attack: create a malformed session', async () => {
  for (const bad of [{ name: '' }, { courts: [] }, { mode: 'chaos' }, { status: 'ended' }, { date: 'tomorrow' }, { extra: 1 }, { createdAt: new Date(0) }]) {
    await assertFails(setDoc(doc(as('carl'), 'sessions/s2'), sessionData({ ownerId: 'carl', organizerIds: ['carl'], ...bad })), JSON.stringify(bad));
  }
});
test("attack: edit, end or delete someone else's session", async () => {
  await seedSession();
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1'), { name: 'Mine now' }));
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1'), { status: 'ended' }));
  await assertFails(deleteDoc(doc(as('carl'), 'sessions/s1')));
});
test('attack: owner hands the session away or rewrites createdAt', async () => {
  await seedSession();
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1'), { ownerId: 'carl', organizerIds: ['carl'] }));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1'), { organizerIds: ['carl'] }));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1'), { createdAt: new Date(5) }));
});
test('attack: stranger adds, edits or reads players', async () => {
  await seedSession();
  await assertFails(setDoc(doc(as('carl'), 'sessions/s1/participants/g_carl1'), guest()));
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1/participants/g_ana1'), { status: 'left' }));
  await assertFails(getDoc(doc(anon(), 'sessions/s1/participants/g_ana1')));
});
test('attack: organizer writes a non-guest or malformed participant (3a is guests only)', async () => {
  await seedSession();
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/ben'), guest({ uid: 'ben', isGuest: false })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_x'), guest()));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_dana1'), guest({ status: 'vip' })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_dana1'), guest({ displayName: '' })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_dana1'), guest({ uid: 'ben' })));
});
test('attack: stranger creates, scores or deletes games, or writes the live state', async () => {
  await seedSession();
  await assertFails(setDoc(doc(as('carl'), 'sessions/s1/matches/c1_2'), game()));
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1/matches/c1_1'), { status: 'overridden', score: { t1: 11, t2: 0 } }));
  await assertFails(deleteDoc(doc(as('carl'), 'sessions/s1/matches/c1_1')));
  await assertFails(setDoc(doc(as('carl'), 'sessions/s1/live/state'), { courts: [] }));
  await assertFails(setDoc(doc(anon(), 'sessions/s1/live/state'), { courts: [] }));
});
test('attack: an ended game goes back to playing, or a bad score', async () => {
  await seedSession();
  await updateDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), { status: 'overridden', score: { t1: 11, t2: 4 }, endedAt: 3000 });
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), game()));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), { score: { t1: 100, t2: 4 } }));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), { score: { t1: 11.5, t2: 4 } }));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/matches/c1_2'), game({ status: 'overridden' })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/matches/c1_3'), game({ hacked: true })));
});

test('owner creates, lists, edits, ends, continues and deletes a session', async () => {
  const db = as('ana');
  await assertSucceeds(setDoc(doc(db, 'sessions/s2'), sessionData()));
  await assertSucceeds(getDocs(query(collection(db, 'sessions'), where('organizerIds', 'array-contains', 'ana'))));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { courts: [{ id: 'c1', name: 'Center', paused: true }], courtRule: { type: 'winnersStay', maxWins: 3 }, shareQr: false }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { host: { deviceId: 'd1', uid: 'ana', beatAt: 5, version: 1 } }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { status: 'ended', endedAt: 9000, host: null }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { status: 'live', endedAt: null }));
  await assertSucceeds(deleteDoc(doc(db, 'sessions/s2')));
});
test('host claims the lease in a transaction', async () => {
  await seedSession();
  const { runTransaction } = await import('firebase/firestore');
  const db = as('ana');
  await assertSucceeds(runTransaction(db, async (tx) => {
    const s = await tx.get(doc(db, 'sessions/s1'));
    tx.update(s.ref, { host: { deviceId: 'd1', uid: 'ana', beatAt: 5, version: (s.data().host?.version ?? 0) + 1 } });
  }));
});
test('anyone can read a session, its games and live state (TV view)', async () => {
  await seedSession();
  await assertSucceeds(getDoc(doc(anon(), 'sessions/s1')));
  await assertSucceeds(getDocs(collection(anon(), 'sessions/s1/matches')));
  await assertSucceeds(getDoc(doc(anon(), 'sessions/s1/live/state')));
});
test('organizer runs the floor: guests, games, scores, swaps, cancels, live state', async () => {
  await seedSession();
  const db = as('ana');
  const b = writeBatch(db);
  b.set(doc(db, 'sessions/s1/participants/g_dana1'), guest());
  b.set(doc(db, 'sessions/s1/participants/g_eve01'), guest({ displayName: 'Eve', status: 'break' }));
  await assertSucceeds(b.commit());
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/participants/g_dana1'), { status: 'left', clientAt: 2 }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_1'), { team2: ['g_ana3', 'g_dana1'], names: { g_dana1: 'Dana' }, clientAt: 3 }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_1'), { status: 'overridden', score: { t1: 11, t2: 9 }, overriddenBy: 'ana', endedAt: 4000 }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_1'), { score: { t1: 11, t2: 7 } }));
  const h = writeBatch(db);
  h.set(doc(db, 'sessions/s1/matches/c1_2'), game({ startedAt: 5000 }));
  h.set(doc(db, 'sessions/s1/live/state'), { courts: [], queue: [], names: {}, hostDeviceId: 'd1', version: 1 });
  await assertSucceeds(h.commit());
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_2'), { status: 'cancelled', endedAt: 6000, clientAt: 6000 }));
});
test('owner deletes a session: children first, then the session', async () => {
  await seedSession();
  const db = as('ana');
  const b = writeBatch(db);
  b.delete(doc(db, 'sessions/s1/participants/g_ana1'));
  b.delete(doc(db, 'sessions/s1/matches/c1_1'));
  b.delete(doc(db, 'sessions/s1/live/state'));
  await assertSucceeds(b.commit());
  await assertSucceeds(deleteDoc(doc(db, 'sessions/s1')));
});
