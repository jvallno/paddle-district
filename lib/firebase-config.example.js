// Copy this file to lib/firebase-config.js and fill in your Firebase project's
// web app config (Firebase console → Project settings → Your apps → Web).
// Only used off localhost — on localhost the app talks to the local emulators
// (see lib/firebase.js), so local development needs no config file.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
