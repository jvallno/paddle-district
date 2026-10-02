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
test('attack: anything outside users/handles', async () => {
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
