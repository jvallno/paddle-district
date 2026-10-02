// Per-session leaderboard (spec §6), computed from the session's matches —
// guests included. Pure — node-tested. Columns follow paddle-district:
// GP, Wins, Losses, Points, Points against, Score diff, Win%, Pt%.
import { winnerOf } from './score-flow.js';

// Disputed games are left out until an organizer settles them.
const COUNTED = new Set(['submitted', 'confirmed', 'overridden']);

export function sessionStats(matches) {
  const rows = new Map();
  const row = (pid, name) => {
    if (!rows.has(pid)) rows.set(pid, { pid, name: name ?? pid, gp: 0, wins: 0, losses: 0, points: 0, pointsAgainst: 0 });
    return rows.get(pid);
  };
  for (const m of matches) {
    if (!COUNTED.has(m.status) || !m.score) continue;
    const winner = winnerOf(m);
    const sides = [['team1', m.score.t1, m.score.t2], ['team2', m.score.t2, m.score.t1]];
    for (const [team, own, opp] of sides) {
      for (const pid of m[team]) {
        const r = row(pid, m.names?.[pid]);
        r.gp += 1;
        r.points += own;
        r.pointsAgainst += opp;
        if (winner === team) r.wins += 1;
        else if (winner) r.losses += 1;
      }
    }
  }
  return [...rows.values()].map((r) => {
    const total = r.points + r.pointsAgainst;
    return {
      ...r,
      diff: r.points - r.pointsAgainst,
      winPct: r.gp ? Math.round((r.wins / r.gp) * 100) : 0,
      ptPct: total ? Math.round((r.points / total) * 100) : 0,
    };
  });
}

const SORT_FIELDS = { wins: 'wins', points: 'points', winpct: 'winPct', ptpct: 'ptPct' };

// sortKey: 'wins' | 'points' | 'winpct' | 'ptpct'. Ties → score diff → name.
export function rankRows(rows, sortKey = 'wins') {
  const f = SORT_FIELDS[sortKey] ?? 'wins';
  return [...rows].sort((a, b) => b[f] - a[f] || b.diff - a.diff || a.name.localeCompare(b.name));
}
