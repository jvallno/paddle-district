// Export a session as CSV or JSON (v1 parity, v1's columns). Pure —
// node-tested; the session screen turns the result into a download.
import { sessionStats } from './session-stats.js';
import { formatClock } from './time-format.js';

// Scored games in play order (cancelled and unscored matches are left out).
export function gameHistory(matches) {
  return matches
    .filter((m) => m.score && m.status !== 'cancelled' && m.status !== 'playing')
    .sort((a, b) => a.startedAt - b.startedAt || (a.mid < b.mid ? -1 : 1));
}

// One row per participant (players with no games show zeros), in roster order.
export function playerRows(participants, matches) {
  const stats = new Map(sessionStats(matches).map((r) => [r.pid, r]));
  return [...participants]
    .sort((a, b) => (a.checkedInAt ?? 0) - (b.checkedInAt ?? 0))
    .map((p) => {
      const r = stats.get(p.pid);
      return {
        name: p.displayName,
        present: p.status === 'here',
        gamesPlayed: r?.gp ?? 0,
        wins: r?.wins ?? 0,
        losses: r?.losses ?? 0,
        points: r?.points ?? 0,
        pointsAgainst: r?.pointsAgainst ?? 0,
        winPct: r?.winPct ?? 0,
        ptPct: r?.ptPct ?? 0,
      };
    });
}

const iso = (ms) => (ms != null ? new Date(ms).toISOString() : null);
const courtName = (session, courtId) => session.courts?.find((c) => c.id === courtId)?.name ?? courtId;
const teamNames = (m, team) => m[team].map((pid) => m.names?.[pid] ?? '?');

export function exportJson(session, participants, matches, now) {
  return {
    session: {
      name: session.name,
      date: session.date,
      venue: session.venue,
      startTime: iso(session.startedAt),
      endTime: iso(session.endedAt),
      duration: session.startedAt != null ? formatClock((session.endedAt ?? now) - session.startedAt) : null,
    },
    players: playerRows(participants, matches),
    gameHistory: gameHistory(matches).map((m, i) => ({
      round: i + 1,
      court: courtName(session, m.courtId),
      duration: m.endedAt != null ? formatClock(m.endedAt - m.startedAt) : null,
      team1: teamNames(m, 'team1'),
      team2: teamNames(m, 'team2'),
      score1: m.score.t1,
      score2: m.score.t2,
    })),
  };
}

// CSV cell: quoted when needed; a leading = + - @ is defused so a spreadsheet
// never runs a player's name as a formula.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(session, participants, matches) {
  const rows = [['Name', 'Present', 'Games', 'Wins', 'Losses', 'Points', 'Points Against', 'Win%', 'Pt%']];
  for (const p of playerRows(participants, matches)) {
    rows.push([p.name, p.present ? 'Yes' : 'No', p.gamesPlayed, p.wins, p.losses, p.points, p.pointsAgainst, `${p.winPct}%`, `${p.ptPct}%`]);
  }
  rows.push([]);
  rows.push(['Round', 'Court', 'Duration', 'Team A', 'Team B', 'Score A', 'Score B']);
  gameHistory(matches).forEach((m, i) => rows.push([
    i + 1, courtName(session, m.courtId), m.endedAt != null ? formatClock(m.endedAt - m.startedAt) : '',
    teamNames(m, 'team1').join(' & '), teamNames(m, 'team2').join(' & '), m.score.t1, m.score.t2,
  ]));
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

// 'Saturday Open Play', '2026-10-04', 'csv' → 'Saturday-Open-Play-2026-10-04.csv'
export function exportFilename(name, date, ext) {
  const base = String(name ?? 'session').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'session';
  return `${base}-${date}.${ext}`;
}
