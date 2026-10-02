// Firebase SDK setup (browser only). Every Firebase import in the app pins the
// same version: 12.19.0.
//
// On localhost the app uses the local emulators (`npm run emulators`) with a
// demo project — no cloud project or config file is needed, and nothing local
// can touch production. Anywhere else it loads lib/firebase-config.js
// (gitignored; copy from firebase-config.example.js).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, memoryLocalCache,
  persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const config = isLocal
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-paddle-district' }
  : (await import('./firebase-config.js')).firebaseConfig;

const app = initializeApp(config);
export const auth = getAuth(app);

// Production keeps data in IndexedDB so reads work offline and writes queue
// until the connection returns (court-side Wi-Fi). Local dev uses memory so a
// restarted emulator never shows stale cached data.
export const db = initializeFirestore(app, {
  localCache: isLocal
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (isLocal) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
