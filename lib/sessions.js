// Sessions in Firestore (spec §4.2, §13): watchers + organizer writes.
// Browser only; shapes and rules of play live in lib/session-model.js.
// Floor actions are fire-and-forget (offline-tolerant): they apply to the
// local cache at once and sync later; callers .catch() to report a rejection.
import { db } from './firebase.js';
import {
  doc, collection, query, where, onSnapshot, setDoc, updateDoc, writeBatch, getDocs,
  serverTimestamp, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { newSessionDoc, cancelMatch, swapPlayer, enterScore, endSessionPatch, continueSessionPatch } from './session-model.js';

const sessionRef = (sid) => doc(db, 'sessions', sid);
const sub = (sid, name) => collection(db, 'sessions', sid, name);

// cb(list | undefined, error?) — snapshot helpers return unsubscribe.
function watchList(q, cb, idKey) {
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ [idKey]: d.id, ...d.data() }))), (err) => cb(undefined, err));
}

export function watchMySessions(uid, cb) {
  return watchList(query(collection(db, 'sessions'), where('organizerIds', 'array-contains', uid)), cb, 'id');
}

// cb(session | null, error?)
export function watchSession(sid, cb) {
  return onSnapshot(sessionRef(sid), (snap) => cb(snap.exists() ? { id: sid, ...snap.data() } : null), (err) => cb(undefined, err));
}
export const watchParticipants = (sid, cb) => watchList(sub(sid, 'participants'), cb, 'pid');
export const watchMatches = (sid, cb) => watchList(sub(sid, 'matches'), cb, 'mid');
export function watchLiveState(sid, cb) {
  return onSnapshot(doc(db, 'sessions', sid, 'live', 'state'), (snap) => cb(snap.exists() ? snap.data() : null), (err) => cb(undefined, err));
}

// Returns the new session id at once (the write syncs in the background).
export function createSession(uid, value) {
  const ref = doc(collection(db, 'sessions'));
  const done = setDoc(ref, { ...newSessionDoc(uid, value, Date.now()), createdAt: serverTimestamp() });
  return { sid: ref.id, done };
}

export function updateSession(sid, fields) {
  return updateDoc(sessionRef(sid), fields);
}
export const endSession = (sid) => updateSession(sid, endSessionPatch(Date.now()));
export const continueSession = (sid) => updateSession(sid, continueSessionPatch());

// Guest ids: g_ + 12 random url-safe characters.
function guestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return `g_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')}`;
}

// names: already parsed + de-duplicated. status: 'here' | 'break'.
export function addGuests(sid, names, status) {
  const now = Date.now();
  const batch = writeBatch(db);
  names.forEach((displayName, i) => {
    batch.set(doc(sub(sid, 'participants'), guestId()), {
      uid: null, isGuest: true, displayName, selfRating: null, status, checkedInAt: now + i, clientAt: now,
    });
  });
  return batch.commit();
}

export function setParticipantStatus(sid, pid, status) {
  return updateDoc(doc(sub(sid, 'participants'), pid), { status, clientAt: Date.now() });
}

// v1's "All here" / "All on hold".
export function setManyStatus(sid, pids, status) {
  const now = Date.now();
  const batch = writeBatch(db);
  pids.forEach((pid) => batch.update(doc(sub(sid, 'participants'), pid), { status, clientAt: now }));
  return batch.commit();
}

// Patches from session-model; { ok: false, error } is returned as a rejected promise.
const rejected = (r) => Promise.reject(new Error(r.error));

export function scoreMatch(sid, match, uid, score) {
  const r = enterScore(match, uid, score, Date.now());
  return r.ok ? updateDoc(doc(sub(sid, 'matches'), match.mid), r.patch) : rejected(r);
}

export function cancelGame(sid, match, fate) {
  const now = Date.now();
  const r = cancelMatch(match, fate, now);
  if (!r.ok) return rejected(r);
  const batch = writeBatch(db);
  batch.update(doc(sub(sid, 'matches'), match.mid), r.patch);
  r.hold.forEach((pid) => batch.update(doc(sub(sid, 'participants'), pid), { status: 'break', clientAt: now }));
  return batch.commit();
}

export function swapInMatch(sid, match, outPid, inPid, inName, busyPids) {
  const r = swapPlayer(match, outPid, inPid, inName, busyPids, Date.now());
  return r.ok ? updateDoc(doc(sub(sid, 'matches'), match.mid), r.patch) : rejected(r);
}

// Needs a connection: deletes every child doc (while the session still exists,
// so the organizer rule passes), then the session. Awaited by the caller.
export async function deleteSession(sid) {
  for (const name of ['participants', 'matches', 'live']) {
    const snap = await getDocs(sub(sid, name));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(sessionRef(sid));
}
