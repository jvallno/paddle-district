// Score reporting state machine (spec §2, §5.5): a player in the match submits,
// a player on the OTHER team confirms or disputes, an organizer can override.
// Pure — node-tested. Each action returns { ok: true, patch } (fields to write
// to the match doc) or { ok: false, error } with a short error code for the UI.
//
//   playing → submitted → confirmed | disputed
//   (any status) → overridden          (organizer only — enforced by rules)

// Statuses after which the court is free and the match has a score.
export const ENDED = new Set(['submitted', 'confirmed', 'disputed', 'overridden']);

const fail = (error) => ({ ok: false, error });

// Scores are whole numbers 0–99. Unusual-but-legal scores come back as
// warnings so the UI can ask "are you sure?" without blocking.
export function validateScore(t1, t2) {
  const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 99;
  if (!ok(t1) || !ok(t2)) return { ok: false, error: 'invalid-score', warnings: [] };
  const warnings = [];
  if (t1 === t2) warnings.push(t1 === 0 ? 'zero-zero' : 'tie');
  else if (Math.abs(t1 - t2) === 1) warnings.push('win-by-one');
  return { ok: true, warnings };
}

export function teamOf(match, pid) {
  if (match.team1.includes(pid)) return 'team1';
  if (match.team2.includes(pid)) return 'team2';
  return null;
}

// 'team1' | 'team2' | null (no score yet, or a tie).
export function winnerOf(match) {
  const s = match.score;
  if (!s) return null;
  if (s.t1 > s.t2) return 'team1';
  if (s.t2 > s.t1) return 'team2';
  return null;
}

export function submitScore(match, pid, { t1, t2 }, now) {
  if (match.status !== 'playing') return fail('not-playing');
  if (!teamOf(match, pid)) return fail('not-in-match');
  const v = validateScore(t1, t2);
  if (!v.ok) return fail(v.error);
  return {
    ok: true,
    warnings: v.warnings,
    patch: { score: { t1, t2 }, status: 'submitted', submittedBy: pid, endedAt: now, clientAt: now },
  };
}

// answer: 'confirm' | 'dispute'
export function respondToScore(match, pid, answer, now) {
  if (match.status !== 'submitted') return fail('not-submitted');
  const mine = teamOf(match, pid);
  if (!mine) return fail('not-in-match');
  if (mine === teamOf(match, match.submittedBy)) return fail('same-team');
  if (answer !== 'confirm' && answer !== 'dispute') return fail('bad-answer');
  return {
    ok: true,
    patch: { status: answer === 'confirm' ? 'confirmed' : 'disputed', respondedBy: pid, clientAt: now },
  };
}

// Organizer sets the final score from any status (incl. 'playing' — e.g. a
// player without a phone). Role is checked by security rules, not here.
export function overrideScore(match, uid, { t1, t2 }, now) {
  const v = validateScore(t1, t2);
  if (!v.ok) return fail(v.error);
  return {
    ok: true,
    warnings: v.warnings,
    patch: { score: { t1, t2 }, status: 'overridden', overriddenBy: uid, endedAt: match.endedAt ?? now, clientAt: now },
  };
}
