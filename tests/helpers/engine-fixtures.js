// Small builders for queue-engine tests. Not a test file itself.
import { step } from '../../lib/queue-engine.js';

// players('a b c d') → participants checked in at t=1,2,3,… in that order.
export function players(spec, extra = {}) {
  return spec.split(/\s+/).filter(Boolean).map((pid, i) => ({
    pid, displayName: pid.toUpperCase(), selfRating: 3, status: 'here', checkedInAt: i + 1, ...extra[pid],
  }));
}

export function courts(n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}`, ...extra[`c${i + 1}`] }));
}

// A finished match on a court. score [t1, t2]; status defaults to 'submitted'.
export function done(courtId, team1, team2, [t1, t2], { startedAt = 10, endedAt = 20, status = 'submitted', streaks } = {}) {
  return { mid: `m_${courtId}_${startedAt}`, courtId, team1, team2, status, score: { t1, t2 }, startedAt, endedAt, streaks };
}

export function live(courtId, team1, team2, startedAt = 10) {
  return { mid: `m_${courtId}_${startedAt}`, courtId, team1, team2, status: 'playing', startedAt };
}

// entry('e1', 'a b', { at: 5 }) → open stacking entry, all partners accepted.
export function entry(eid, pids, { at = 0, accepted, status = 'open' } = {}) {
  const ps = pids.split(' ');
  return { eid, players: ps, accepted: accepted ? accepted.split(' ') : ps, status, createdAt: at };
}

export function run({ mode = 'fairness', rule = { type: 'everyoneOff' }, courtList = courts(1), participants, entries = [], matches = [], now = 1000 }) {
  let n = 0;
  return step({
    config: { mode, courtRule: rule, courts: courtList },
    participants, entries, matches, now,
    makeId: () => `new${++n}`,
  });
}

// Teams of new match i as sorted arrays, for order-insensitive assertions.
export const teams = (out, i = 0) => [out.newMatches[i].team1, out.newMatches[i].team2].map((t) => [...t].sort());
