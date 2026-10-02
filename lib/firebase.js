// Firebase SDK setup (browser only). Every Firebase import in the app pins the
// same version: 12.19.0.
//
// The app talks to the LIVE project (lib/firebase-config.js — gitignored; copy
// from firebase-config.example.js) everywhere, including localhost, so local
// work sees real data. On localhost, add ?emulators to the URL for a throwaway
// sandbox on the local emulators (`npm run emulators`, demo project) — see
// lib/data-mode.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, memoryLocalCache,
  persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import { dataMode } from './data-mode.js';

export const mode = dataMode(window.location.hostname, window.location.search);
const useEmulators = mode === 'emulators';

const config = useEmulators
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-paddle-district' }
  : (await import('./firebase-config.js')).firebaseConfig;

const app = initializeApp(config);
export const auth = getAuth(app);

// Live data is kept in IndexedDB so reads work offline and writes queue until
// the connection returns (court-side Wi-Fi). The emulator sandbox uses memory
// so a restarted emulator never shows stale cached data.
export const db = initializeFirestore(app, {
  localCache: useEmulators
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
