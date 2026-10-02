// Player profiles in Firestore (spec §4.1): users/{uid} + handles/{handle}.
// Browser only; field rules live in lib/profile-input.js and firestore.rules.
import { db } from './firebase.js';
import {
  doc, getDoc, onSnapshot, writeBatch, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// cb(profile | null, undefined, { pending, fromCache }) whenever users/{uid} changes,
// including when the server confirms a local write (pending → false).
// cb(undefined, error) if the snapshot fails. Returns unsubscribe.
export function watchProfile(uid, cb) {
  return onSnapshot(
    doc(db, 'users', uid),
    { includeMetadataChanges: true },
    (snap) => cb(snap.exists() ? { uid, ...snap.data() } : null, undefined, { pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache }),
    (err) => cb(undefined, err),
  );
}

export async function isHandleTaken(handle) {
  return (await getDoc(doc(db, 'handles', handle))).exists();
}

// First-time setup: claim the handle and create the profile in one batch so
// the rules can check both together. Awaited (setup needs a connection).
// Throws Error('handle-taken') if someone claimed the handle first.
export async function createProfile(uid, { displayName, handle, photoURL, selfRating }) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'handles', handle), { uid });
  batch.set(doc(db, 'users', uid), {
    displayName, handle, photoURL: photoURL ?? '', selfRating, createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    if (err?.code === 'permission-denied' && await isHandleTaken(handle)) throw new Error('handle-taken');
    throw err;
  }
}

// Edits apply to the local cache immediately and sync when online, so callers
// don't await this for UI feedback — they .catch() it to report a rejection.
export function updateProfile(uid, fields) {
  return updateDoc(doc(db, 'users', uid), fields);
}

// @handle → profile, or null if no one has it.
export async function findByHandle(handle) {
  const claim = await getDoc(doc(db, 'handles', handle));
  if (!claim.exists()) return null;
  const { uid } = claim.data();
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}
