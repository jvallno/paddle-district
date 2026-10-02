// The signed-in player's session, shared by the app shell and features. Pure
// (no DOM/Firebase) — lib/app.js feeds it from Firebase.
//   status: 'loading' | 'signedOut' | 'needsProfile' | 'ready'
//   user:   Firebase Auth user or null;  profile: users/{uid} data or null
let state = { status: 'loading', user: null, profile: null };
const listeners = new Set();

export function getSession() {
  return state;
}

export function setSession(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

// fn(state) after every change. Returns unsubscribe.
export function onSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Session status after a profile snapshot, or null to ignore the snapshot.
// A profile that exists only as an unconfirmed local write (pending) doesn't
// make a new player 'ready': if the rules reject it (e.g. the handle was
// taken) the app would bounce away from setup and back, wiping the form.
// Once ready, pending edits are normal (offline-tolerant profile edits).
// "No profile" from the local cache alone (fromCache) proves nothing — a
// returning player on a new, offline device would wrongly land on setup — so
// wait for the server.
export function statusForProfile(currentStatus, profile, pending, fromCache = false) {
  if (!profile && fromCache) return null;
  if (profile && pending && currentStatus !== 'ready') return null;
  return profile ? 'ready' : 'needsProfile';
}
