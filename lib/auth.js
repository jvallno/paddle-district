// Google sign-in (spec §2: signed in with Google = verified). Browser only.
import { auth } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

// cb(user | null) on every sign-in state change. Returns unsubscribe.
export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// Resolves when signed in; rejects with a Firebase error (closing the popup
// gives code 'auth/popup-closed-by-user', which callers can ignore).
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export function signOut() {
  return fbSignOut(auth);
}
