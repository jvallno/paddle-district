// Which Firebase backend the app talks to. Pure — node-tested.
// Localhost uses the LIVE project by default (like inventory-tracking-system),
// so local work sees and changes real data. Add ?emulators to the URL for a
// throwaway sandbox on the local emulators (`npm run emulators`).
export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// → 'live' | 'emulators'
export function dataMode(hostname, search) {
  if (!LOCAL_HOSTS.has(hostname)) return 'live';
  return new URLSearchParams(search).has('emulators') ? 'emulators' : 'live';
}

// Corner badge on localhost so it's always clear which data you're touching;
// null in production.
export function envBadge(hostname, mode) {
  if (!LOCAL_HOSTS.has(hostname)) return null;
  return mode === 'emulators'
    ? { kind: 'sandbox', label: 'Sandbox · emulators' }
    : { kind: 'live', label: 'LIVE DATA' };
}
