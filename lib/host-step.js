// What the host writes after one engine step (spec §13.4). Pure — node-tested;
// lib/host.js commits the result in one fire-and-forget batch.
//
// session       the sessions/{sid} doc data
// participants  [{ pid, ...participant doc }]
// matches       [{ mid, ...match doc }]   (times are ms numbers)
// lastKey       the stateKey this host wrote last (null at start)
// Returns { matches: [{ mid, data }], state, stateKey, write } — write is false
// when nothing changed since lastKey, so the host skips the batch.
import { step } from './queue-engine.js';
import { nextMatchId } from './session-model.js';

export function hostStep({ session, participants, matches, now, deviceId, lastKey = null }) {
  const out = step({
    config: { mode: session.mode ?? 'fairness', courtRule: session.courtRule, courts: session.courts ?? [] },
    participants,
    matches,
    now,
    makeId: nextMatchId,
  });
  const newMatches = out.newMatches.map(({ mid, ...data }) => ({ mid, data: { ...data, endedAt: null, score: null, clientAt: now } }));
  const { updatedAt, ...content } = out.state;
  const stateKey = JSON.stringify(content);
  const state = { ...out.state, hostDeviceId: deviceId, version: session.host?.version ?? 0 };
  return { matches: newMatches, state, stateKey, write: newMatches.length > 0 || stateKey !== lastKey };
}
