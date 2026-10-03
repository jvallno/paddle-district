// Host lease decisions (spec §5.6, §13.4). Pure — node-tested; lib/host.js
// reads sessions/{sid}.host and acts on the answer.
//
// host: null | { deviceId, uid, beatAt (ms), version }

export const BEAT_MS = 5000;   // the host renews this often
export const LEASE_MS = 20000; // older than this → anyone may claim

// 'mine'  — this device holds the lease (keep hosting, renew)
// 'free'  — nobody holds it, or the holder stopped renewing (claim it)
// 'taken' — another device is hosting
export function leaseState(host, deviceId, now) {
  if (host?.deviceId && host.deviceId === deviceId) return 'mine';
  if (!host?.deviceId || !(now - host.beatAt <= LEASE_MS)) return 'free';
  return 'taken';
}

export function claimHost(prev, deviceId, uid, now) {
  return { deviceId, uid, beatAt: now, version: (prev?.version ?? 0) + 1 };
}
