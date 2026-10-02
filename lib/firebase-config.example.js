// Copy this file to lib/firebase-config.js and fill in your Firebase project's
// web app config (Firebase console → Project settings → Your apps → Web).
// Used everywhere, including localhost (local dev sees LIVE data by default).
// Add ?emulators to the URL on localhost for a throwaway sandbox on the local
// emulators — see lib/data-mode.js.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
