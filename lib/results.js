// Builds append-only results-log entries (spec §4.3) for the host to write.
// Pure — node-tested. A match is logged once it is confirmed or overridden.
// Logs are never edited: if a logged match's score later changes (organizer
// override), a 'correction' entry pointing at the previous one is written.
//
// makeId receives { kind: 'result', mid, sig } so the host can derive ids
// deterministically (two devices then write the same doc).
// The host writes each `result` to results/{result.rid} and applies
// `matchPatch` to the match in the same batch, so the next call skips it.
const FINAL = new Set(['confirmed', 'overridden']);

// participantsById: Map pid → participant ({ uid, isGuest }).
export function pendingResults(matches, participantsById, sessionId, makeId) {
  const out = [];
  for (const m of matches) {
    if (!FINAL.has(m.status) || !m.score) continue;
    const sig = `${m.score.t1}-${m.score.t2}`;
    if (m.loggedSig === sig) continue;
    const side = (team) => team.map((pid) => {
      const p = participantsById.get(pid);
      // Unknown pid: a real player's pid is their uid; guests are 'g_…'.
      const isGuest = p ? !!p.isGuest : pid.startsWith('g_');
      return { uid: isGuest ? null : (p?.uid ?? pid), isGuest };
    });
    const rid = makeId({ kind: 'result', mid: m.mid, sig });
    out.push({
      result: {
        rid,
        sessionId,
        matchId: m.mid,
        team1: side(m.team1),
        team2: side(m.team2),
        score: { t1: m.score.t1, t2: m.score.t2 },
        playedAt: m.endedAt ?? m.startedAt,
        kind: m.loggedRid ? 'correction' : 'result',
        corrects: m.loggedRid ?? null,
      },
      matchId: m.mid,
      matchPatch: { loggedSig: sig, loggedRid: rid },
    });
  }
  return out;
}
