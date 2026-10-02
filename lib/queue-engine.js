// The paddle-queue engine (spec §5). Pure — node-tested. The host device calls
// step() whenever participants, queue entries or matches change. step() never
// writes anything: it returns the matches to start, the queue-entry status
// changes, and the live/state document, and the host commits them in a batch.
//
// Inputs (plain objects; the host converts Firestore Timestamps to ms):
//   config       { mode: 'fairness'|'stacking',
//                  courtRule: { type: 'everyoneOff'|'winnersStay'|'winnersSplit', maxWins },
//                  courts: [{ id, name, paused }] }            (court order = fill order)
//   participants [{ pid, displayName, selfRating, status: 'here'|'break'|'left', checkedInAt }]
//   entries      [{ eid, players: [pid] (1, 2 or 4), accepted: [pid],
//                   status: 'open'|'assigned'|'cancelled', createdAt, clientAt }]
//   matches      [{ mid, courtId, team1, team2, status, score, startedAt, endedAt, streaks }]
//   now          ms;  makeId(ctx) → new id; ctx is { kind: 'match', courtId, prevMid }
//                (prevMid = the court's last match, or null) so a host can derive ids
//                deterministically — two devices stepping the same state agree.
//
// Output: { newMatches, entryUpdates: [{ eid, status }], state }
import { ENDED, winnerOf } from './score-flow.js';
import { bestSplit, recentPairs } from './team-balance.js';

export function step({ config, participants, entries = [], matches, now, makeId }) {
  const byPid = new Map(participants.map((p) => [p.pid, p]));
  const isHere = (pid) => byPid.get(pid)?.status === 'here';
  const rule = config.courtRule ?? { type: 'everyoneOff' };

  // Who is on court right now.
  const liveByCourt = new Map();
  const playing = new Set();
  for (const m of matches) {
    if (m.status !== 'playing') continue;
    liveByCourt.set(m.courtId, m);
    [...m.team1, ...m.team2].forEach((pid) => playing.add(pid));
  }

  // Winners who keep a free court under winnersStay / winnersSplit.
  const lastByCourt = latestMatchPerCourt(matches);
  const latestOf = latestMatchPerPlayer(matches);
  const freeCourts = config.courts.filter((c) => !c.paused && !liveByCourt.has(c.id));
  const stayersByCourt = new Map();
  const reserved = new Set();
  for (const c of freeCourts) {
    const stayers = stayersFor(lastByCourt.get(c.id), rule, isHere, (pid) => !playing.has(pid) && latestOf.get(pid) === lastByCourt.get(c.id));
    stayersByCourt.set(c.id, stayers);
    stayers.forEach((pid) => reserved.add(pid));
  }
  const busy = (pid) => playing.has(pid) || reserved.has(pid);

  const source = config.mode === 'stacking'
    ? stackingSource(entries, byPid, busy)
    : fairnessSource(participants, matches, busy);

  const pairs = recentPairs(matches);
  const rated = (pid) => ({ pid, rating: byPid.get(pid)?.selfRating });
  const newMatches = [];
  for (const court of freeCourts) {
    let stayers = stayersByCourt.get(court.id);
    let got = source.take(4 - stayers.length);
    // Stacking deadlock guard: holders waiting, but only an exact group of 4 is
    // ready — release the holders (everyone off) and start that group.
    if (!got && stayers.length && config.mode === 'stacking') {
      got = source.take(4);
      if (got) {
        stayers.forEach((pid) => reserved.delete(pid));
        stayers = [];
        stayersByCourt.set(court.id, stayers);
      }
    }
    if (!got) continue;
    const [team1, team2] = composeTeams(stayers, got, rule, config.mode, rated, pairs);
    const last = lastByCourt.get(court.id);
    const streaks = Object.fromEntries(stayers.map((pid) => [pid, (last.streaks?.[pid] ?? 0) + 1]));
    const all = [...team1, ...team2];
    newMatches.push({
      mid: makeId({ kind: 'match', courtId: court.id, prevMid: last?.mid ?? null }),
      courtId: court.id,
      team1,
      team2,
      status: 'playing',
      startedAt: now,
      streaks,
      names: namesFor(all, byPid),
    });
    all.forEach((pid) => playing.add(pid));
    stayers.forEach((pid) => reserved.delete(pid));
  }

  const newByCourt = new Map(newMatches.map((m) => [m.courtId, m]));
  const courts = config.courts.map((c) => {
    const m = newByCourt.get(c.id) ?? liveByCourt.get(c.id);
    return {
      courtId: c.id,
      name: c.name,
      paused: !!c.paused,
      matchId: m?.mid ?? null,
      team1: m?.team1 ?? [],
      team2: m?.team2 ?? [],
      startedAt: m?.startedAt ?? null,
      holding: m ? [] : (stayersByCourt.get(c.id) ?? []), // winners waiting for challengers
    };
  });
  const queue = source.remaining();
  const shown = [
    ...courts.flatMap((c) => [...c.team1, ...c.team2, ...c.holding]),
    ...queue.flatMap((q) => q.pids),
  ];
  return {
    newMatches,
    entryUpdates: source.entryUpdates,
    state: { mode: config.mode, courts, queue, names: namesFor(shown, byPid), updatedAt: now },
  };
}

function latestMatchPerCourt(matches) {
  const last = new Map();
  for (const m of matches) {
    const prev = last.get(m.courtId);
    if (!prev || isLater(m, prev)) last.set(m.courtId, m);
  }
  return last;
}

// Later start wins; equal starts tie-break on mid so the pick is deterministic.
const isLater = (a, b) => a.startedAt > b.startedAt || (a.startedAt === b.startedAt && a.mid > b.mid);

function latestMatchPerPlayer(matches) {
  const last = new Map();
  for (const m of matches) {
    for (const pid of [...m.team1, ...m.team2]) {
      const prev = last.get(pid);
      if (!prev || isLater(m, prev)) last.set(pid, m);
    }
  }
  return last;
}

// The winners of a court's last finished game stay on if the court rule says
// so, they're still here, free, and that match is their own latest one (they
// haven't since played elsewhere), and they haven't hit the maxWins cap.
// A tie (no winner) sends everyone off.
function stayersFor(last, rule, isHere, isFreshFor) {
  if (!last || !ENDED.has(last.status) || rule.type === 'everyoneOff') return [];
  const winner = winnerOf(last);
  if (!winner) return [];
  const maxWins = rule.maxWins ?? 2;
  return last[winner].filter((pid) => isHere(pid) && isFreshFor(pid) && (last.streaks?.[pid] ?? 0) + 1 < maxWins);
}

// Fairness: everyone here and free, longest-waiting first — never played,
// then oldest last-game end, then earliest check-in, then pid.
function fairnessSource(participants, matches, busy) {
  const lastEnd = new Map();
  for (const m of matches) {
    if (m.endedAt == null) continue;
    for (const pid of [...m.team1, ...m.team2]) lastEnd.set(pid, Math.max(lastEnd.get(pid) ?? -Infinity, m.endedAt));
  }
  const pool = participants
    .filter((p) => p.status === 'here' && !busy(p.pid))
    .sort((a, b) =>
      (lastEnd.get(a.pid) ?? -Infinity) - (lastEnd.get(b.pid) ?? -Infinity)
      || (a.checkedInAt ?? 0) - (b.checkedInAt ?? 0)
      || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0))
    .map((p) => p.pid);
  return {
    entryUpdates: [],
    take(n) {
      if (pool.length < n) return null;
      return { pairs: [], singles: pool.splice(0, n) };
    },
    remaining: () => pool.map((pid) => ({ pids: [pid] })),
  };
}

// Stacking: open entries in first-come order (server time, else device time).
// A court is filled by the earliest combination of ready entries that fits exactly.
// Malformed entries (size not 1/2/4, repeated pid) and entries with a player who
// left are cancelled; a player in two entries keeps only the earlier one (only
// accepted players count, so an unanswered invite can't lock the invitee out).
// An entry is ready when every partner has accepted and everyone in it is here
// and free; unknown players or not-ready entries keep their place.
function stackingSource(entries, byPid, busy) {
  const entryUpdates = [];
  const at = (e) => e.createdAt ?? e.clientAt ?? 0;
  const open = entries
    .filter((e) => e.status === 'open')
    .sort((a, b) => at(a) - at(b) || (a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0));
  const seen = new Set();
  const line = [];
  for (const e of open) {
    const malformed = ![1, 2, 4].includes(e.players.length) || new Set(e.players).size !== e.players.length;
    const gone = e.players.some((pid) => byPid.get(pid)?.status === 'left');
    const dup = e.players.some((pid) => seen.has(pid));
    if (malformed || gone || dup) {
      entryUpdates.push({ eid: e.eid, status: 'cancelled' });
      continue;
    }
    e.players.filter((pid) => (e.accepted ?? []).includes(pid)).forEach((pid) => seen.add(pid));
    line.push(e);
  }
  const ready = (e) => e.players.every((pid) =>
    (e.accepted ?? []).includes(pid) && byPid.get(pid)?.status === 'here' && !busy(pid));

  return {
    entryUpdates,
    take(n) {
      // DFS: find valid combo of ready entries summing exactly to n.
      // Try including each ready entry before excluding it. Skip not-ready entries.
      const findCombination = (startIdx, remain) => {
        if (remain === 0) return [];
        if (startIdx >= line.length) return null;
        const e = line[startIdx];
        if (!ready(e)) return findCombination(startIdx + 1, remain);
        // Try including this entry first.
        if (e.players.length <= remain) {
          const incl = findCombination(startIdx + 1, remain - e.players.length);
          if (incl !== null) return [e, ...incl];
        }
        // If including doesn't work, try excluding.
        return findCombination(startIdx + 1, remain);
      };
      const chosen = findCombination(0, n) ?? [];
      if (chosen.length === 0) return null;
      for (const e of chosen) {
        line.splice(line.indexOf(e), 1);
        entryUpdates.push({ eid: e.eid, status: 'assigned' });
      }
      const pairs = [];
      const singles = [];
      for (const e of chosen) {
        if (e.players.length === 4) pairs.push(e.players.slice(0, 2), e.players.slice(2));
        else if (e.players.length === 2) pairs.push([...e.players]);
        else singles.push(e.players[0]);
      }
      return { pairs, singles };
    },
    remaining: () => line.map((e) => ({ eid: e.eid, pids: [...e.players], ready: ready(e) })),
  };
}

// Builds [team1, team2] from the court's stayers plus what the queue gave.
function composeTeams(stayers, got, rule, mode, rated, recent) {
  const incoming = [...got.pairs.flat(), ...got.singles];
  if (stayers.length === 2 && rule.type === 'winnersSplit') {
    return [[stayers[0], incoming[0]], [stayers[1], incoming[1]]];
  }
  if (mode === 'fairness' && stayers.length < 2) {
    return bestSplit([...stayers, ...incoming].map(rated), recent);
  }
  // Pairs (stacked groups, or winners who stay together) keep their team;
  // single players pair up in order — stayers first, then arrival order.
  const teams = stayers.length === 2 ? [stayers, ...got.pairs] : [...got.pairs];
  const singles = [...(stayers.length === 1 ? stayers : []), ...got.singles];
  for (let i = 0; i < singles.length; i += 2) teams.push([singles[i], singles[i + 1]]);
  return [teams[0], teams[1]];
}

function namesFor(pids, byPid) {
  return Object.fromEntries([...new Set(pids)].map((pid) => [pid, byPid.get(pid)?.displayName ?? '?']));
}
