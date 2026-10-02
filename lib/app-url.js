// Absolute app links (e.g. QR codes) that keep the ?emulators sandbox flag on
// localhost, so a link made in the sandbox never opens against live data.
// Pure — node-tested; pass window.location (or any { origin, pathname, hostname, search }).
import { dataMode } from './data-mode.js';

export function appUrl(loc, hash) {
  const sandbox = dataMode(loc.hostname, loc.search) === 'emulators';
  return `${loc.origin}${loc.pathname}${sandbox ? '?emulators' : ''}${hash}`;
}
