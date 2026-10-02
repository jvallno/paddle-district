// Splits four players into two balanced doubles teams (spec §5.2). Pure —
// node-tested. Uses each player's self-rating for now; the #4 rating engine
// will supply real ratings later through the same `rating` field.
export const DEFAULT_RATING = 3.0;

// The three distinct ways to split players[0..3] into two pairs.
const SPLITS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// players: exactly 4 × { pid, rating? }. recent: Set of pairKey()s to avoid.
// Picks the smallest gap between team-average ratings; among equal gaps, the
// split repeating the fewest recent partnerships; then the first split.
// Returns [team1Pids, team2Pids].
export function bestSplit(players, recent = new Set()) {
  const avg = (team) => team.reduce((s, p) => s + (p.rating ?? DEFAULT_RATING), 0) / team.length;
  let best = null;
  for (const [a, b] of SPLITS) {
    const t1 = a.map((i) => players[i]);
    const t2 = b.map((i) => players[i]);
    const gap = Math.abs(avg(t1) - avg(t2));
    const repeats = [t1, t2].filter(([x, y]) => recent.has(pairKey(x.pid, y.pid))).length;
    const better = !best
      || gap < best.gap - 1e-9
      || (Math.abs(gap - best.gap) <= 1e-9 && repeats < best.repeats);
    if (better) best = { gap, repeats, t1, t2 };
  }
  return [best.t1.map((p) => p.pid), best.t2.map((p) => p.pid)];
}

// Each player's partner in their most recent match, as a Set of pairKey()s.
export function recentPairs(matches) {
  const last = new Map(); // pid → { startedAt, team }
  for (const m of matches) {
    for (const team of [m.team1, m.team2]) {
      for (const pid of team) {
        const prev = last.get(pid);
        if (!prev || m.startedAt > prev.startedAt) last.set(pid, { startedAt: m.startedAt, team });
      }
    }
  }
  const keys = new Set();
  for (const { team } of last.values()) if (team.length === 2) keys.add(pairKey(team[0], team[1]));
  return keys;
}
