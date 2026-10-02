# Core Game Logic Implementation Plan (Spec 1 · Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every game rule in Spec 1 — handles, score reporting, session leaderboard, team balancing, the paddle-queue engine (fairness + stacking, three court rules), and results-log entries — as pure, node-tested `lib/` modules.

**Architecture:** Pure ES modules with no DOM or Firebase imports, so they run under `node --test`. The queue engine is one function, `step()`, that takes plain snapshots (participants, queue entries, matches) and returns what to write; Plan 3's host device will call it and commit the output to Firestore. Nothing in this plan touches the browser, Firebase, or the network.

**Tech Stack:** Vanilla JavaScript ES modules, `node --test` + `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md`

**Plan series:** Plan 1 (this) — core game logic · Plan 2 — Firebase foundation, security rules + emulator tests, sign-in & profiles · Plan 3 — live sessions: create/join, host device, player/organizer/TV views. Plans 2–3 are written after this one lands so they build on the real interfaces.

## Global Constraints

- Vanilla JS ES modules, **no build step**, no new package dependencies (AGENTS.md → Stack & ground rules).
- Every new `lib/` module in this plan is **pure**: no imports of DOM, Firebase, or any browser API. Only relative imports of other pure `lib/` modules.
- Tests use `node:test` + `node:assert/strict`, live in `tests/*.test.js`; shared fixtures go in `tests/helpers/` (not matched by `node --test` discovery).
- Match AGENTS.md / existing code style: 2-space indent, single quotes, semicolons, short header comment saying what the module is and that it's pure.
- `@handle`: lower-case `[a-z0-9_]{3,20}` (spec §4.1).
- Self-rating range 2.0–8.0; a missing rating counts as **3.0**.
- Scores: whole numbers **0–99**; 0–0, ties and win-by-one **warn, never block** (spec §9).
- Court frees on **submit**; `ENDED` = submitted, confirmed, disputed, overridden (spec §5.5).
- Court rules: `everyoneOff` | `winnersStay` | `winnersSplit`, `maxWins` default **2**; a tie sends everyone off (spec §5.4).
- Results log is **append-only**; changes become `correction` entries (spec §4.3).
- Guests never get a `uid` in results (spec §2).
- Commits: one local commit per task, message ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **No push, no deploy** (user rule: localhost before live).

## Review Focus

Inputs the spec implies but doesn't spell out, most likely to bite first. Each one has a pinning test in the task named:

1. **A winner held on court who has also stacked themselves** must not be put on a second court. The entry waits (not ready) until they're free. → Task 5, `queue-engine-rules.test.js` "held winner who also stacked".
2. **A live match on a court the organizer removed from config** must keep its players busy, not let them be scheduled twice. → Task 5, `queue-engine-fairness.test.js` "court no longer in config".
3. **Two stack entries with the same timestamp** (offline devices, coarse clocks) must order deterministically, so every host computes the same queue. → Task 5, `queue-engine-stacking.test.js` "same instant".
4. **A live match referencing a participant record that no longer exists** must render `?`, not crash the host. → Task 5, `queue-engine-fairness.test.js` "player record is missing".
5. **A logged match whose player record vanished, or that has no `endedAt`** must still produce a valid result (player logged as guest, `playedAt` falls back to `startedAt`). → Task 6, `results.test.js` last test.

## Spec deltas this plan introduces (recorded in Task 7)

- `queueEntries.status` is `open | assigned | cancelled`. "Ready" (all partners accepted) is derived from `accepted[]`, not stored as `pending`/`waiting`.
- Match docs gain `respondedBy` (who confirmed **or** disputed; replaces `confirmedBy`), `streaks {pid: winsInARow}`, `loggedSig`, `loggedRid`.
- The engine signature is `step({ config, participants, entries, matches, now, makeId }) → { newMatches, entryUpdates, state }`. It derives court occupancy from `matches`, so it takes no previous `state` and no `rng` (balancing is deterministic). Results come from a separate pure `pendingResults()` in `lib/results.js`.
- `live/state` shape: `{ mode, courts: [{ courtId, name, paused, matchId, team1, team2, startedAt, holding }], queue: [{ pids, eid?, ready? }], names, updatedAt }`. The host adds `hostDeviceId` and `version`.
- TV route becomes `#/tv/{sid}` (the existing `parseHash` supports one param), not `#/s/{sid}/tv`.

## File structure

| File | Responsibility |
|---|---|
| `lib/handle.js` | Normalize, validate and suggest `@handle`s |
| `lib/score-flow.js` | Score validation and the submit → confirm/dispute → override state machine; `winnerOf`, `teamOf`, `ENDED` |
| `lib/session-stats.js` | Per-session leaderboard rows and ranking |
| `lib/team-balance.js` | Best 2v2 split by rating; recent-partner detection |
| `lib/queue-engine.js` | `step()`: fill free courts per mode and court rule; build `live/state` |
| `lib/results.js` | Results-log entries (and corrections) for confirmed/overridden matches |
| `tests/helpers/engine-fixtures.js` | Builders for engine tests |
| `tests/*.test.js` | One suite per module (engine has three) |

---

### Task 1: Handles (`lib/handle.js`)

**Files:**
- Create: `lib/handle.js`
- Test: `tests/handle.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeHandle(input: any) → string`, `isValidHandle(handle: string) → boolean`, `suggestHandle(displayName: string) → string` (always valid). Used by Plan 2's profile setup.

- [ ] **Step 1: Write the failing tests**

Create `tests/handle.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, isValidHandle, suggestHandle } from '../lib/handle.js';

test('normalizeHandle trims, strips leading @ and lower-cases', () => {
  assert.equal(normalizeHandle('  @Maria_D '), 'maria_d');
  assert.equal(normalizeHandle('@@Ben'), 'ben');
  assert.equal(normalizeHandle(null), '');
});

test('isValidHandle accepts 3–20 of [a-z0-9_] only', () => {
  assert.equal(isValidHandle('ben'), true);
  assert.equal(isValidHandle('a_b_9'), true);
  assert.equal(isValidHandle('x'.repeat(20)), true);
  assert.equal(isValidHandle('ab'), false);
  assert.equal(isValidHandle('x'.repeat(21)), false);
  assert.equal(isValidHandle('Ben'), false, 'must be normalized first');
  assert.equal(isValidHandle('ben.d'), false);
  assert.equal(isValidHandle('bén'), false);
});

test('suggestHandle turns a display name into a valid handle', () => {
  assert.equal(suggestHandle('María Dela Cruz'), 'maria_dela_cruz');
  assert.equal(suggestHandle('  Ben  O\'Neil!! '), 'ben_o_neil');
  assert.equal(suggestHandle('Jo'), 'jo_player');
  assert.equal(suggestHandle('李'), 'player');
  assert.equal(suggestHandle(''), 'player');
  const long = suggestHandle('Alexandria Konstantinopoulou Smith');
  assert.ok(isValidHandle(long), long);
  assert.ok(!long.endsWith('_'));
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/handle.test.js`
Expected: FAIL — `Cannot find module '…/lib/handle.js'`

- [ ] **Step 3: Implement**

Create `lib/handle.js`:

```js
// @handle rules for player profiles (spec §4.1). Pure — node-tested.
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

// "  @Maria_D " → "maria_d". Does not validate; pair with isValidHandle.
export function normalizeHandle(input) {
  return String(input ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export function isValidHandle(handle) {
  return HANDLE_RE.test(handle);
}

// Starting suggestion for the setup screen: "María Dela Cruz" → "maria_dela_cruz".
// Always returns a valid handle; uniqueness is checked against Firestore later.
export function suggestHandle(displayName) {
  const base = String(displayName ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
    .replace(/_+$/, '');
  if (base.length >= 3) return base;
  return (base ? `${base}_player` : 'player').slice(0, 20);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/handle.test.js`
Expected: PASS, 0 failures. Then run `npm test` — whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/handle.test.js lib/handle.js
git commit -m "feat(lib): @handle normalize/validate/suggest"
```

### Task 2: Score flow (`lib/score-flow.js`)

**Files:**
- Create: `lib/score-flow.js`
- Test: `tests/score-flow.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `ENDED: Set<string>`; `validateScore(t1, t2) → { ok, error?, warnings: ('zero-zero'|'tie'|'win-by-one')[] }`; `teamOf(match, pid) → 'team1'|'team2'|null`; `winnerOf(match) → 'team1'|'team2'|null`; `submitScore(match, pid, {t1,t2}, now)`, `respondToScore(match, pid, 'confirm'|'dispute', now)`, `overrideScore(match, uid, {t1,t2}, now)` each `→ { ok: true, patch, warnings? } | { ok: false, error }`. Error codes: `invalid-score`, `not-playing`, `not-in-match`, `not-submitted`, `same-team`, `bad-answer`. Match shape: `{ team1: pid[], team2: pid[], status, score?: {t1,t2}, submittedBy?, endedAt? }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/score-flow.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDED, validateScore, teamOf, winnerOf, submitScore, respondToScore, overrideScore,
} from '../lib/score-flow.js';

const playing = () => ({ team1: ['a', 'b'], team2: ['c', 'd'], status: 'playing', startedAt: 100 });

test('validateScore accepts whole numbers 0–99 and rejects the rest', () => {
  assert.deepEqual(validateScore(11, 7), { ok: true, warnings: [] });
  for (const [t1, t2] of [[-1, 5], [100, 3], [11.5, 9], [NaN, 2], ['11', 9], [null, 0]]) {
    assert.equal(validateScore(t1, t2).ok, false, `${t1}-${t2}`);
  }
});

test('validateScore warns on 0–0, ties and win-by-one without blocking', () => {
  assert.deepEqual(validateScore(0, 0), { ok: true, warnings: ['zero-zero'] });
  assert.deepEqual(validateScore(9, 9), { ok: true, warnings: ['tie'] });
  assert.deepEqual(validateScore(11, 10), { ok: true, warnings: ['win-by-one'] });
});

test('teamOf and winnerOf', () => {
  const m = { ...playing(), score: { t1: 7, t2: 11 } };
  assert.equal(teamOf(m, 'a'), 'team1');
  assert.equal(teamOf(m, 'd'), 'team2');
  assert.equal(teamOf(m, 'zz'), null);
  assert.equal(winnerOf(m), 'team2');
  assert.equal(winnerOf({ ...m, score: { t1: 5, t2: 5 } }), null);
  assert.equal(winnerOf(playing()), null);
});

test('ENDED lists the statuses that free a court', () => {
  assert.deepEqual([...ENDED].sort(), ['confirmed', 'disputed', 'overridden', 'submitted']);
});

test('a player in the match can submit while playing', () => {
  const r = submitScore(playing(), 'b', { t1: 11, t2: 7 }, 500);
  assert.deepEqual(r, {
    ok: true,
    warnings: [],
    patch: { score: { t1: 11, t2: 7 }, status: 'submitted', submittedBy: 'b', endedAt: 500, clientAt: 500 },
  });
});

test('submit is refused for outsiders, bad scores, or a non-playing match', () => {
  assert.deepEqual(submitScore(playing(), 'x', { t1: 11, t2: 7 }, 1), { ok: false, error: 'not-in-match' });
  assert.deepEqual(submitScore(playing(), 'a', { t1: 111, t2: 7 }, 1), { ok: false, error: 'invalid-score' });
  const done = { ...playing(), status: 'submitted' };
  assert.deepEqual(submitScore(done, 'a', { t1: 11, t2: 7 }, 1), { ok: false, error: 'not-playing' });
});

test('only the opposing team can confirm or dispute', () => {
  const m = { ...playing(), status: 'submitted', submittedBy: 'a', score: { t1: 11, t2: 7 } };
  assert.deepEqual(respondToScore(m, 'b', 'confirm', 9), { ok: false, error: 'same-team' });
  assert.deepEqual(respondToScore(m, 'a', 'confirm', 9), { ok: false, error: 'same-team' });
  assert.deepEqual(respondToScore(m, 'x', 'confirm', 9), { ok: false, error: 'not-in-match' });
  assert.deepEqual(respondToScore(m, 'c', 'maybe', 9), { ok: false, error: 'bad-answer' });
  assert.deepEqual(respondToScore(m, 'c', 'confirm', 9), {
    ok: true, patch: { status: 'confirmed', respondedBy: 'c', clientAt: 9 },
  });
  assert.deepEqual(respondToScore(m, 'd', 'dispute', 9), {
    ok: true, patch: { status: 'disputed', respondedBy: 'd', clientAt: 9 },
  });
});

test('cannot respond before a score is submitted, or twice', () => {
  assert.deepEqual(respondToScore(playing(), 'c', 'confirm', 1), { ok: false, error: 'not-submitted' });
  const confirmed = { ...playing(), status: 'confirmed', submittedBy: 'a', score: { t1: 11, t2: 7 } };
  assert.deepEqual(respondToScore(confirmed, 'c', 'dispute', 1), { ok: false, error: 'not-submitted' });
});

test('override works from any status and keeps the original end time', () => {
  const disputed = { ...playing(), status: 'disputed', score: { t1: 11, t2: 7 }, endedAt: 400 };
  assert.deepEqual(overrideScore(disputed, 'org', { t1: 11, t2: 9 }, 900).patch, {
    score: { t1: 11, t2: 9 }, status: 'overridden', overriddenBy: 'org', endedAt: 400, clientAt: 900,
  });
  const r = overrideScore(playing(), 'org', { t1: 2, t2: 11 }, 900);
  assert.equal(r.patch.endedAt, 900, 'a still-playing match ends now');
  assert.deepEqual(overrideScore(playing(), 'org', { t1: -2, t2: 11 }, 900), { ok: false, error: 'invalid-score' });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/score-flow.test.js`
Expected: FAIL — `Cannot find module '…/lib/score-flow.js'`

- [ ] **Step 3: Implement**

Create `lib/score-flow.js`:

```js
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/score-flow.test.js`
Expected: PASS, 0 failures. Then run `npm test` — whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/score-flow.test.js lib/score-flow.js
git commit -m "feat(lib): score submit/confirm/dispute/override state machine"
```

### Task 3: Session leaderboard (`lib/session-stats.js`)

**Files:**
- Create: `lib/session-stats.js`
- Test: `tests/session-stats.test.js`

**Interfaces:**
- Consumes: `winnerOf` from `lib/score-flow.js` (Task 2).
- Produces: `sessionStats(matches) → [{ pid, name, gp, wins, losses, points, pointsAgainst, diff, winPct, ptPct }]` (names from each match's `names` map; counts `submitted|confirmed|overridden`, skips `disputed`); `rankRows(rows, 'wins'|'points'|'winpct'|'ptpct') → rows` sorted by metric desc, then `diff` desc, then `name` asc.

- [ ] **Step 1: Write the failing tests**

Create `tests/session-stats.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionStats, rankRows } from '../lib/session-stats.js';

const names = { a: 'Ana', b: 'Ben', c: 'Cy', d: 'Dee', g_1: 'Guest Gio' };
const m = (status, t1, t2, team1 = ['a', 'b'], team2 = ['c', 'd']) =>
  ({ status, team1, team2, score: t1 == null ? undefined : { t1, t2 }, names });
const byPid = (rows) => Object.fromEntries(rows.map((r) => [r.pid, r]));

test('a counted game updates both teams', () => {
  const rows = byPid(sessionStats([m('confirmed', 11, 7)]));
  assert.deepEqual(rows.a, {
    pid: 'a', name: 'Ana', gp: 1, wins: 1, losses: 0, points: 11, pointsAgainst: 7, diff: 4, winPct: 100, ptPct: 61,
  });
  assert.deepEqual(rows.d, {
    pid: 'd', name: 'Dee', gp: 1, wins: 0, losses: 1, points: 7, pointsAgainst: 11, diff: -4, winPct: 0, ptPct: 39,
  });
});

test('submitted and overridden count; playing and disputed do not', () => {
  const rows = byPid(sessionStats([
    m('submitted', 11, 9), m('overridden', 3, 11), m('playing'), m('disputed', 11, 0),
  ]));
  assert.equal(rows.a.gp, 2);
  assert.equal(rows.a.wins, 1);
  assert.equal(rows.a.losses, 1);
  assert.equal(rows.a.points, 14);
});

test('a tie counts as played with no win or loss', () => {
  const rows = byPid(sessionStats([m('confirmed', 9, 9)]));
  assert.deepEqual([rows.a.wins, rows.a.losses, rows.a.gp, rows.a.diff], [0, 0, 1, 0]);
});

test('guests appear on the session leaderboard by their snapshot name', () => {
  const rows = byPid(sessionStats([m('confirmed', 11, 4, ['a', 'g_1'])]));
  assert.equal(rows.g_1.name, 'Guest Gio');
  assert.equal(rows.g_1.wins, 1);
});

test('no games → empty leaderboard', () => {
  assert.deepEqual(sessionStats([]), []);
});

test('rankRows sorts by the chosen metric, then score diff, then name', () => {
  const rows = [
    { name: 'Cy', wins: 2, points: 30, winPct: 50, ptPct: 55, diff: 3 },
    { name: 'Ana', wins: 2, points: 40, winPct: 67, ptPct: 52, diff: 8 },
    { name: 'Ben', wins: 1, points: 50, winPct: 100, ptPct: 70, diff: 8 },
    { name: 'Abe', wins: 2, points: 40, winPct: 67, ptPct: 52, diff: 8 },
  ];
  assert.deepEqual(rankRows(rows, 'wins').map((r) => r.name), ['Abe', 'Ana', 'Cy', 'Ben']);
  assert.deepEqual(rankRows(rows, 'points').map((r) => r.name), ['Ben', 'Abe', 'Ana', 'Cy']);
  assert.deepEqual(rankRows(rows, 'winpct').map((r) => r.name), ['Ben', 'Abe', 'Ana', 'Cy']);
  assert.deepEqual(rankRows(rows, 'ptpct').map((r) => r.name), ['Ben', 'Cy', 'Abe', 'Ana']);
  assert.deepEqual(rankRows(rows, 'bogus').map((r) => r.name), ['Abe', 'Ana', 'Cy', 'Ben'], 'unknown key → wins');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/session-stats.test.js`
Expected: FAIL — `Cannot find module '…/lib/session-stats.js'`

- [ ] **Step 3: Implement**

Create `lib/session-stats.js`:

```js
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/session-stats.test.js`
Expected: PASS, 0 failures. Then run `npm test` — whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/session-stats.test.js lib/session-stats.js
git commit -m "feat(lib): per-session leaderboard stats and ranking"
```

### Task 4: Team balancing (`lib/team-balance.js`)

**Files:**
- Create: `lib/team-balance.js`
- Test: `tests/team-balance.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFAULT_RATING = 3.0`; `pairKey(a, b) → string` (order-independent); `bestSplit(players: [{pid, rating?}] ×4, recent?: Set<pairKey>) → [pid[2], pid[2]]`; `recentPairs(matches) → Set<pairKey>` (each player's partner in their latest match by `startedAt`).

- [ ] **Step 1: Write the failing tests**

Create `tests/team-balance.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSplit, recentPairs, pairKey, DEFAULT_RATING } from '../lib/team-balance.js';

const p = (pid, rating) => ({ pid, rating });

test('pairKey is order-independent', () => {
  assert.equal(pairKey('b', 'a'), 'a|b');
  assert.equal(pairKey('a', 'b'), 'a|b');
});

test('strongest pairs with weakest', () => {
  const [t1, t2] = bestSplit([p('a', 5), p('b', 4.5), p('c', 3), p('d', 2.5)]);
  assert.deepEqual([t1, t2], [['a', 'd'], ['b', 'c']]);
});

test('missing ratings count as the default', () => {
  assert.equal(DEFAULT_RATING, 3.0);
  const [t1] = bestSplit([p('a', 4), p('b'), p('c'), p('d', 2)]);
  assert.deepEqual(t1, ['a', 'd']);
});

test('on equal balance, avoids repeating a recent partnership', () => {
  const four = [p('a', 3), p('b', 3), p('c', 3), p('d', 3)];
  assert.deepEqual(bestSplit(four), [['a', 'b'], ['c', 'd']], 'first split when nothing to avoid');
  const recent = new Set([pairKey('a', 'b')]);
  assert.deepEqual(bestSplit(four, recent), [['a', 'c'], ['b', 'd']]);
});

test('balance beats partner variety', () => {
  const recent = new Set([pairKey('a', 'd')]);
  const [t1] = bestSplit([p('a', 5), p('b', 4.5), p('c', 3), p('d', 2.5)], recent);
  assert.deepEqual(t1, ['a', 'd']);
});

test('recentPairs uses only each player\'s latest match', () => {
  const matches = [
    { team1: ['a', 'b'], team2: ['c', 'd'], startedAt: 1 },
    { team1: ['a', 'c'], team2: ['e', 'f'], startedAt: 2 },
  ];
  assert.deepEqual([...recentPairs(matches)].sort(), ['a|c', 'b|a', 'c|d', 'e|f'].map((k) => pairKey(...k.split('|'))).sort());
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/team-balance.test.js`
Expected: FAIL — `Cannot find module '…/lib/team-balance.js'`

- [ ] **Step 3: Implement**

Create `lib/team-balance.js`:

```js
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/team-balance.test.js`
Expected: PASS, 0 failures. Then run `npm test` — whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/team-balance.test.js lib/team-balance.js
git commit -m "feat(lib): rating-balanced 2v2 team split"
```

### Task 5: Queue engine (`lib/queue-engine.js`)

**Files:**
- Create: `lib/queue-engine.js`
- Create: `tests/helpers/engine-fixtures.js` (test builders; not a test file)
- Test: `tests/queue-engine-fairness.test.js`, `tests/queue-engine-stacking.test.js`, `tests/queue-engine-rules.test.js`

**Interfaces:**
- Consumes: `ENDED`, `winnerOf` (Task 2); `bestSplit`, `recentPairs` (Task 4).
- Produces: `step({ config, participants, entries, matches, now, makeId }) → { newMatches, entryUpdates, state }`. See the header comment in the implementation for exact input shapes. `newMatches[i] = { mid, courtId, team1, team2, status: 'playing', startedAt, streaks, names }`. `entryUpdates[i] = { eid, status: 'assigned'|'cancelled' }`. `state = { mode, courts: [{ courtId, name, paused, matchId, team1, team2, startedAt, holding }], queue: [{ pids, eid?, ready? }], names, updatedAt }`. Plan 3's host calls this and writes the output.

**How the engine thinks** (read before coding):
- A court is busy if a match on it has `status: 'playing'`. A court frees as soon as its latest match reaches any `ENDED` status.
- On a free court, the **latest** match's winners stay (are "held") if the rule isn't `everyoneOff`, there's a winner (no tie), they're `here`, and `(streaks[pid] ?? 0) + 1 < maxWins`. Held players are reserved for that court and never enter the queue.
- The court then needs `4 − held` players from the **source**: fairness = everyone `here` and free, longest-waiting first; stacking = `open` entries in time order, filled first-fit (an entry that isn't ready or doesn't fit keeps its place).
- Teams: `winnersSplit` with two held winners → each winner partners one incoming player. Fairness with fewer than two held → `bestSplit`. Otherwise pairs stay together and singles pair up in order (held winner first).
- The engine is a pure function of its inputs. Same inputs give the same output on any host.

- [ ] **Step 1: Write the failing tests**

Create `tests/helpers/engine-fixtures.js`:

```js
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
```

Create `tests/queue-engine-fairness.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { players, courts, done, live, run, teams } from './helpers/engine-fixtures.js';

test('fewer than 4 free players → no match, everyone shown waiting', () => {
  const out = run({ participants: players('a b c') });
  assert.deepEqual(out.newMatches, []);
  assert.deepEqual(out.state.queue, [{ pids: ['a'] }, { pids: ['b'] }, { pids: ['c'] }]);
  assert.equal(out.state.courts[0].matchId, null);
});

test('4 players + 1 free court → one match with full metadata', () => {
  const out = run({ participants: players('a b c d'), now: 5000 });
  assert.equal(out.newMatches.length, 1);
  const m = out.newMatches[0];
  assert.equal(m.mid, 'new1');
  assert.equal(m.courtId, 'c1');
  assert.equal(m.status, 'playing');
  assert.equal(m.startedAt, 5000);
  assert.deepEqual(m.streaks, {});
  assert.deepEqual(m.names, { a: 'A', b: 'B', c: 'C', d: 'D' });
  assert.deepEqual([...m.team1, ...m.team2].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(out.state.courts[0].matchId, 'new1');
  assert.deepEqual(out.state.queue, []);
});

test('never-played first, then longest since last game, then check-in order', () => {
  const ps = players('a b c d e f g h');
  const matches = [
    done('c1', ['a', 'b'], ['c', 'd'], [11, 5], { endedAt: 300 }),
    done('c2', ['e', 'f'], ['g', 'h'], [11, 5], { endedAt: 200 }),
  ];
  const fresh = players('x y', {});
  fresh.forEach((p) => { p.checkedInAt = 50; });
  const out = run({ participants: [...ps, ...fresh], matches, courtList: courts(2) });
  // x, y never played; then e f g h (ended 200) → first court gets x y e f.
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2].sort(), ['e', 'f', 'x', 'y']);
  assert.deepEqual([...out.newMatches[1].team1, ...out.newMatches[1].team2].sort(), ['a', 'b', 'g', 'h']);
  assert.deepEqual(out.state.queue.map((q) => q.pids[0]), ['c', 'd']);
});

test('players on break, who left, or on court are skipped', () => {
  const ps = players('a b c d e f g', { b: { status: 'break' }, c: { status: 'left' } });
  const out = run({ participants: ps, matches: [live('c1', ['e', 'f'], ['g', 'zz'])], courtList: courts(2) });
  assert.deepEqual(out.newMatches, [], 'only a and d are free');
  assert.deepEqual(out.state.queue, [{ pids: ['a'] }, { pids: ['d'] }]);
  assert.equal(out.state.courts[0].matchId, 'm_c1_10', 'live match still shown');
});

test('teams are balanced by self-rating', () => {
  const ps = players('a b c d', { a: { selfRating: 5 }, b: { selfRating: 4.5 }, c: { selfRating: 3 }, d: { selfRating: 2.5 } });
  assert.deepEqual(teams(run({ participants: ps })), [['a', 'd'], ['b', 'c']]);
});

test('paused courts are never filled', () => {
  const out = run({ participants: players('a b c d'), courtList: courts(2, { c1: { paused: true } }) });
  assert.equal(out.newMatches[0].courtId, 'c2');
  assert.equal(out.state.courts[0].paused, true);
});

test('a submitted score frees the court immediately (everyone off)', () => {
  const ps = players('a b c d e f g h');
  const out = run({ participants: ps, matches: [done('c1', ['a', 'b'], ['c', 'd'], [11, 9])] });
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2].sort(), ['e', 'f', 'g', 'h']);
  assert.deepEqual(out.state.queue.map((q) => q.pids[0]).sort(), ['a', 'b', 'c', 'd']);
});

test('fills several free courts in court order', () => {
  const out = run({ participants: players('a b c d e f g h i'), courtList: courts(3) });
  assert.deepEqual(out.newMatches.map((m) => m.courtId), ['c1', 'c2']);
  assert.deepEqual(out.state.queue, [{ pids: ['i'] }]);
});

test('state.names covers everyone on court and in the queue', () => {
  const out = run({ participants: players('a b c d e') });
  assert.deepEqual(Object.keys(out.state.names).sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(out.state.mode, 'fairness');
  assert.equal(out.state.updatedAt, 1000);
});

test('a live match on a court no longer in config still keeps its players busy', () => {
  const out = run({ participants: players('a b c d e f g h'), matches: [live('gone', ['a', 'b'], ['c', 'd'])] });
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2].sort(), ['e', 'f', 'g', 'h']);
});

test('a live match whose player record is missing renders "?" instead of crashing', () => {
  const out = run({ participants: players('a b c'), matches: [live('c1', ['a', 'b'], ['c', 'zz'])] });
  assert.equal(out.state.names.zz, '?');
});
```

Create `tests/queue-engine-stacking.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { players, courts, live, entry, run } from './helpers/engine-fixtures.js';

const S = { mode: 'stacking' };

test('checked-in players who have not stacked are not queued', () => {
  const out = run({ ...S, participants: players('a b c d') });
  assert.deepEqual(out.newMatches, []);
  assert.deepEqual(out.state.queue, []);
});

test('four solos go on in arrival order: 1st+2nd vs 3rd+4th', () => {
  const out = run({
    ...S,
    participants: players('a b c d e'),
    entries: [entry('e4', 'd', { at: 4 }), entry('e1', 'a', { at: 1 }), entry('e3', 'c', { at: 3 }), entry('e2', 'b', { at: 2 }), entry('e5', 'e', { at: 5 })],
  });
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(out.entryUpdates, ['e1', 'e2', 'e3', 'e4'].map((eid) => ({ eid, status: 'assigned' })));
  assert.deepEqual(out.state.queue, [{ eid: 'e5', pids: ['e'], ready: true }]);
});

test('a stacked pair stays together; two solos form the other team', () => {
  const out = run({
    ...S,
    participants: players('a b c d'),
    entries: [entry('s1', 'a', { at: 1 }), entry('p1', 'b c', { at: 2 }), entry('s2', 'd', { at: 3 })],
  });
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['b', 'c'], ['a', 'd']]);
});

test('a group of 4 takes a whole court with its own teams', () => {
  const out = run({ ...S, participants: players('a b c d'), entries: [entry('g', 'a b c d')] });
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['a', 'b'], ['c', 'd']]);
});

test('an entry that does not fit keeps its place for the next court', () => {
  // 3 solos then a group of 4: the 4 can't join the solos, so court 1 waits for
  // a 4th solo; court 2 (if free) takes the group of 4.
  const ps = players('a b c d e f g h');
  const entries = [entry('s1', 'a', { at: 1 }), entry('s2', 'b', { at: 2 }), entry('s3', 'c', { at: 3 }), entry('g', 'd e f g', { at: 4 }), entry('s4', 'h', { at: 5 })];
  const out = run({ ...S, participants: ps, entries, courtList: courts(2) });
  assert.deepEqual(out.newMatches.map((m) => [...m.team1, ...m.team2]), [['a', 'b', 'c', 'h'], ['d', 'e', 'f', 'g']]);
});

test('a group of 4 at the front waits while solos behind it use a court', () => {
  const ps = players('a b c d e f g h');
  const entries = [entry('g', 'a b c d', { at: 1 }), entry('s1', 'e', { at: 2 }), entry('s2', 'f', { at: 3 }), entry('s3', 'g', { at: 4 }), entry('s4', 'h', { at: 5 })];
  const out = run({ ...S, participants: ps, entries, matches: [live('c2', ['x1', 'x2'], ['x3', 'x4'])], courtList: courts(2) });
  // c1 is the only free court; group of 4 is first in line and fits an empty court.
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2], ['a', 'b', 'c', 'd']);
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['s1', 's2', 's3', 's4']);
});

test('a group is not ready until every partner accepts — it keeps its place', () => {
  const ps = players('a b c d e f');
  const entries = [entry('p', 'a b', { at: 1, accepted: 'a' }), entry('s1', 'c', { at: 2 }), entry('s2', 'd', { at: 3 }), entry('s3', 'e', { at: 4 }), entry('s4', 'f', { at: 5 })];
  const out = run({ ...S, participants: ps, entries });
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2], ['c', 'd', 'e', 'f']);
  assert.deepEqual(out.state.queue, [{ eid: 'p', pids: ['a', 'b'], ready: false }]);
});

test('on-break or on-court players keep their place but are skipped', () => {
  const ps = players('a b c d e', { a: { status: 'break' } });
  const entries = [entry('s1', 'a', { at: 1 }), entry('s2', 'b', { at: 2 }), entry('s3', 'c', { at: 3 }), entry('s4', 'd', { at: 4 }), entry('s5', 'e', { at: 5 })];
  const out = run({ ...S, participants: ps, entries });
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2], ['b', 'c', 'd', 'e']);
  assert.deepEqual(out.state.queue, [{ eid: 's1', pids: ['a'], ready: false }]);
});

test('entries with a player who left are cancelled', () => {
  const ps = players('a b', { b: { status: 'left' } });
  const out = run({ ...S, participants: ps, entries: [entry('p', 'a b', { at: 1 }), entry('s', 'a', { at: 2 })] });
  assert.deepEqual(out.entryUpdates, [{ eid: 'p', status: 'cancelled' }]);
  assert.deepEqual(out.state.queue, [{ eid: 's', pids: ['a'], ready: true }]);
});

test('a player stacked twice keeps only the earlier entry', () => {
  const ps = players('a b');
  const out = run({ ...S, participants: ps, entries: [entry('late', 'a', { at: 9 }), entry('early', 'a', { at: 1 }), entry('b', 'b', { at: 5 })] });
  assert.deepEqual(out.entryUpdates, [{ eid: 'late', status: 'cancelled' }]);
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['early', 'b']);
});

test('pending server time falls back to device time; assigned/cancelled entries are ignored', () => {
  const ps = players('a b c d e');
  const entries = [
    { eid: 'x', players: ['a'], accepted: ['a'], status: 'open', createdAt: null, clientAt: 7 },
    entry('old', 'e', { at: 0, status: 'assigned' }),
    entry('s1', 'b', { at: 1 }), entry('s2', 'c', { at: 2 }), entry('s3', 'd', { at: 3 }),
  ];
  const out = run({ ...S, participants: ps, entries });
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['b', 'c'], ['d', 'a']]);
});

test('entries stacked at the same instant are ordered by id (deterministic)', () => {
  const entries = [entry('e_b', 'b', { at: 5 }), entry('e_a', 'a', { at: 5 })];
  const out = run({ ...S, participants: players('a b'), entries });
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['e_a', 'e_b']);
});
```

Create `tests/queue-engine-rules.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { players, courts, done, entry, run, teams } from './helpers/engine-fixtures.js';

const stay = { type: 'winnersStay', maxWins: 2 };
const split = { type: 'winnersSplit', maxWins: 2 };
const six = () => players('a b c d e f');
const firstGame = (opts) => done('c1', ['a', 'b'], ['c', 'd'], [11, 6], opts);

test('everyone off: winners go back into the rotation like everyone else', () => {
  const out = run({ participants: players('a b c d e f g h'), matches: [firstGame()] });
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2].sort(), ['e', 'f', 'g', 'h']);
  assert.deepEqual(out.newMatches[0].streaks, {});
  assert.deepEqual(out.state.courts[0].holding, []);
});

test('winners stay: winners keep the court, next two challenge', () => {
  const out = run({ rule: stay, participants: six(), matches: [firstGame()] });
  assert.deepEqual(teams(out), [['a', 'b'], ['e', 'f']]);
  assert.deepEqual(out.newMatches[0].streaks, { a: 1, b: 1 });
  assert.deepEqual(out.state.queue.map((q) => q.pids[0]).sort(), ['c', 'd']);
});

test('winners stay: after maxWins in a row, everyone off', () => {
  const second = firstGame({ streaks: { a: 1, b: 1 } });
  const out = run({ rule: stay, participants: players('a b c d e f g h'), matches: [second] });
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2].sort(), ['e', 'f', 'g', 'h']);
  assert.deepEqual(out.newMatches[0].streaks, {});
});

test('winners stay with maxWins 3 allows a second defence', () => {
  const second = firstGame({ streaks: { a: 1, b: 1 } });
  const out = run({ rule: { type: 'winnersStay', maxWins: 3 }, participants: six(), matches: [second] });
  assert.deepEqual(teams(out), [['a', 'b'], ['e', 'f']]);
  assert.deepEqual(out.newMatches[0].streaks, { a: 2, b: 2 });
});

test('a tie sends everyone off', () => {
  const out = run({ rule: stay, participants: six(), matches: [done('c1', ['a', 'b'], ['c', 'd'], [9, 9])] });
  assert.deepEqual(out.newMatches[0].streaks, {});
});

test('winners still on court wait for challengers and are shown as holding', () => {
  const ps = players('a b c d e', { c: { status: 'break' }, d: { status: 'break' } });
  const out = run({ rule: stay, participants: ps, matches: [firstGame()] });
  assert.deepEqual(out.newMatches, [], 'only e is free to challenge');
  assert.deepEqual(out.state.courts[0].holding, ['a', 'b']);
  assert.ok(!out.state.queue.some((q) => q.pids.includes('a')), 'held winners are not in the queue');
});

test('a winner who went on break does not stay; the other winner needs 3 incoming', () => {
  const ps = players('a b c d e f g', { b: { status: 'break' } });
  const out = run({ rule: stay, participants: ps, matches: [firstGame()] });
  const m = out.newMatches[0];
  assert.deepEqual(m.streaks, { a: 1 });
  assert.ok([...m.team1, ...m.team2].includes('a'));
  assert.ok(!([...m.team1, ...m.team2].includes('b')));
});

test('winners split: each winner partners one incoming player', () => {
  const out = run({ rule: split, participants: six(), matches: [firstGame()] });
  const m = out.newMatches[0];
  assert.deepEqual([m.team1, m.team2], [['a', 'e'], ['b', 'f']]);
  assert.deepEqual(m.streaks, { a: 1, b: 1 });
});

test('winners split: streaks are per player — a 2-time winner leaves, a 1-time winner stays', () => {
  const g = done('c1', ['a', 'e'], ['b', 'f'], [11, 3], { streaks: { a: 1 } });
  const out = run({ rule: split, participants: players('a b c d e f g'), matches: [g] });
  const m = out.newMatches[0];
  assert.deepEqual(m.streaks, { e: 1 });
  assert.ok(!([...m.team1, ...m.team2].includes('a')), 'a hit maxWins');
});

test('stacking + winners stay: a pair entry challenges; a group of 4 cannot', () => {
  const entries = [entry('g', 'g h i j', { at: 1 }), entry('p', 'e f', { at: 2 })];
  const out = run({ mode: 'stacking', rule: stay, participants: players('a b c d e f g h i j'), entries, matches: [firstGame()] });
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['a', 'b'], ['e', 'f']]);
  assert.deepEqual(out.entryUpdates, [{ eid: 'p', status: 'assigned' }]);
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['g']);
});

test('stacking + winners split: incoming pair is split across the winners', () => {
  const out = run({ mode: 'stacking', rule: split, participants: six(), entries: [entry('p', 'e f', { at: 1 })], matches: [firstGame()] });
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['a', 'e'], ['b', 'f']]);
});

test('stacking: losers are not re-queued automatically', () => {
  const out = run({ mode: 'stacking', rule: stay, participants: six(), matches: [firstGame()] });
  assert.deepEqual(out.newMatches, []);
  assert.deepEqual(out.state.queue, []);
  assert.deepEqual(out.state.courts[0].holding, ['a', 'b']);
});

test('a disputed last game still decides who stays (court already freed on submit)', () => {
  const out = run({ rule: stay, participants: six(), matches: [firstGame({ status: 'disputed' })] });
  assert.deepEqual(teams(out), [['a', 'b'], ['e', 'f']]);
});

test('only the latest game on a court matters', () => {
  const older = done('c1', ['c', 'd'], ['e', 'f'], [11, 2], { startedAt: 1, endedAt: 5 });
  const out = run({ rule: stay, participants: six(), matches: [older, firstGame()], courtList: courts(1) });
  assert.deepEqual(out.newMatches[0].streaks, { a: 1, b: 1 });
});

test('a held winner who also stacked is not double-booked on another court', () => {
  const entries = ['a', 'c', 'd', 'e', 'f'].map((pid, i) => entry(`s_${pid}`, pid, { at: i + 1 }));
  const ps = players('a b c d e f');
  const out = run({ mode: 'stacking', rule: stay, participants: ps, entries, matches: [firstGame()], courtList: courts(2) });
  // c1: a b hold and take challengers c d; c2 needs 4 more but only e f are free.
  assert.deepEqual([out.newMatches[0].team1, out.newMatches[0].team2], [['a', 'b'], ['c', 'd']]);
  assert.equal(out.newMatches.length, 1);
  assert.equal(out.state.queue.find((q) => q.eid === 's_a').ready, false);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/queue-engine-fairness.test.js tests/queue-engine-stacking.test.js tests/queue-engine-rules.test.js`
Expected: FAIL — `Cannot find module '…/lib/queue-engine.js'` (imported via the fixtures helper)

- [ ] **Step 3: Implement**

Create `lib/queue-engine.js`:

```js
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
//   now          ms;  makeId() → new match id
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
  const freeCourts = config.courts.filter((c) => !c.paused && !liveByCourt.has(c.id));
  const stayersByCourt = new Map();
  const reserved = new Set();
  for (const c of freeCourts) {
    const stayers = stayersFor(lastByCourt.get(c.id), rule, isHere);
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
    const stayers = stayersByCourt.get(court.id);
    const got = source.take(4 - stayers.length);
    if (!got) continue;
    const [team1, team2] = composeTeams(stayers, got, rule, config.mode, rated, pairs);
    const last = lastByCourt.get(court.id);
    const streaks = Object.fromEntries(stayers.map((pid) => [pid, (last.streaks?.[pid] ?? 0) + 1]));
    const all = [...team1, ...team2];
    newMatches.push({
      mid: makeId(),
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
    if (!prev || m.startedAt > prev.startedAt) last.set(m.courtId, m);
  }
  return last;
}

// The winners of a court's last finished game stay on if the court rule says
// so, they're still here, and they haven't hit the maxWins-in-a-row cap.
// A tie (no winner) sends everyone off.
function stayersFor(last, rule, isHere) {
  if (!last || !ENDED.has(last.status) || rule.type === 'everyoneOff') return [];
  const winner = winnerOf(last);
  if (!winner) return [];
  const maxWins = rule.maxWins ?? 2;
  return last[winner].filter((pid) => isHere(pid) && (last.streaks?.[pid] ?? 0) + 1 < maxWins);
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
// Entries with a player who left are cancelled; a player in two entries keeps
// only the earlier one. An entry is ready when every partner has accepted and
// everyone in it is here and free; one that isn't ready or doesn't fit the
// open slots keeps its place.
function stackingSource(entries, byPid, busy) {
  const entryUpdates = [];
  const at = (e) => e.createdAt ?? e.clientAt ?? 0;
  const open = entries
    .filter((e) => e.status === 'open')
    .sort((a, b) => at(a) - at(b) || (a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0));
  const seen = new Set();
  const line = [];
  for (const e of open) {
    const gone = e.players.some((pid) => !byPid.has(pid) || byPid.get(pid).status === 'left');
    const dup = e.players.some((pid) => seen.has(pid));
    if (gone || dup) {
      entryUpdates.push({ eid: e.eid, status: 'cancelled' });
      continue;
    }
    e.players.forEach((pid) => seen.add(pid));
    line.push(e);
  }
  const ready = (e) => e.players.every((pid) =>
    (e.accepted ?? []).includes(pid) && byPid.get(pid).status === 'here' && !busy(pid));

  return {
    entryUpdates,
    take(n) {
      const chosen = [];
      let slots = 0;
      for (const e of line) {
        if (!ready(e) || slots + e.players.length > n) continue;
        chosen.push(e);
        slots += e.players.length;
        if (slots === n) break;
      }
      if (slots !== n) return null;
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/queue-engine-fairness.test.js tests/queue-engine-stacking.test.js tests/queue-engine-rules.test.js`
Expected: PASS, 0 failures. Then run `npm test` — whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/engine-fixtures.js tests/queue-engine-fairness.test.js tests/queue-engine-stacking.test.js tests/queue-engine-rules.test.js lib/queue-engine.js
git commit -m "feat(lib): paddle-queue engine — fairness/stacking modes and court rules"
```

### Task 6: Results log entries (`lib/results.js`)

**Files:**
- Create: `lib/results.js`
- Test: `tests/results.test.js`

**Interfaces:**
- Consumes: nothing (match shape from Task 2, plus `mid`, `loggedSig`, `loggedRid`).
- Produces: `pendingResults(matches, participantsById: Map<pid, {uid, isGuest}>, sessionId, makeId) → [{ result: { rid, sessionId, matchId, team1: [{uid|null, isGuest}], team2, score, playedAt, kind: 'result'|'correction', corrects: rid|null }, matchId, matchPatch: { loggedSig, loggedRid } }]`. Plan 3's host writes each `result` to `results/{rid}` and applies `matchPatch` in the same batch.

- [ ] **Step 1: Write the failing tests**

Create `tests/results.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingResults } from '../lib/results.js';

const people = new Map([
  ['a', { uid: 'a', isGuest: false }],
  ['b', { uid: 'b', isGuest: false }],
  ['c', { uid: 'c', isGuest: false }],
  ['g_1', { uid: null, isGuest: true }],
]);
const match = (over) => ({
  mid: 'm1', team1: ['a', 'b'], team2: ['c', 'g_1'], status: 'confirmed',
  score: { t1: 11, t2: 7 }, startedAt: 100, endedAt: 900, ...over,
});
const ids = () => { let n = 0; return () => `r${++n}`; };

test('a confirmed match produces one result entry and a match patch', () => {
  assert.deepEqual(pendingResults([match()], people, 's1', ids()), [{
    result: {
      rid: 'r1', sessionId: 's1', matchId: 'm1',
      team1: [{ uid: 'a', isGuest: false }, { uid: 'b', isGuest: false }],
      team2: [{ uid: 'c', isGuest: false }, { uid: null, isGuest: true }],
      score: { t1: 11, t2: 7 }, playedAt: 900, kind: 'result', corrects: null,
    },
    matchId: 'm1',
    matchPatch: { loggedSig: '11-7', loggedRid: 'r1' },
  }]);
});

test('playing, submitted and disputed matches are not logged yet', () => {
  const ms = ['playing', 'submitted', 'disputed'].map((status) => match({ status }));
  assert.deepEqual(pendingResults(ms, people, 's1', ids()), []);
});

test('an already-logged match is skipped', () => {
  assert.deepEqual(pendingResults([match({ loggedSig: '11-7', loggedRid: 'r0' })], people, 's1', ids()), []);
});

test('override after logging writes a correction pointing at the previous entry', () => {
  const m = match({ status: 'overridden', score: { t1: 11, t2: 9 }, loggedSig: '11-7', loggedRid: 'r0' });
  const [out] = pendingResults([m], people, 's1', ids());
  assert.equal(out.result.kind, 'correction');
  assert.equal(out.result.corrects, 'r0');
  assert.deepEqual(out.matchPatch, { loggedSig: '11-9', loggedRid: 'r1' });
});

test('override that keeps the same score adds nothing', () => {
  const m = match({ status: 'overridden', loggedSig: '11-7', loggedRid: 'r0' });
  assert.deepEqual(pendingResults([m], people, 's1', ids()), []);
});

test('a player missing from participants is logged as a guest; no endedAt falls back to start', () => {
  const [out] = pendingResults([match({ team2: ['zz', 'c'], endedAt: undefined })], people, 's1', ids());
  assert.deepEqual(out.result.team2[0], { uid: null, isGuest: true });
  assert.equal(out.result.playedAt, 100);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/results.test.js`
Expected: FAIL — `Cannot find module '…/lib/results.js'`

- [ ] **Step 3: Implement**

Create `lib/results.js`:

```js
// Builds append-only results-log entries (spec §4.3) for the host to write.
// Pure — node-tested. A match is logged once it is confirmed or overridden.
// Logs are never edited: if a logged match's score later changes (organizer
// override), a 'correction' entry pointing at the previous one is written.
//
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
      const isGuest = !p || !!p.isGuest;
      return { uid: isGuest ? null : p.uid, isGuest };
    });
    const rid = makeId();
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/results.test.js`
Expected: PASS, 0 failures. Then run `npm test` — whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/results.test.js lib/results.js
git commit -m "feat(lib): append-only results log entries with corrections"
```

### Task 7: Record spec deltas and update the docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md`
- Modify: `docs/INDEX.md`
- Modify: `AGENTS.md` (the pure-module list under "`lib/` — two kinds of module")

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update the spec to match what was built**

In the spec, make these edits:
- §4.2 `queueEntries` row: replace `` `status` (`pending`\|`waiting`\|`assigned`\|`cancelled`) `` with `` `status` (`open`\|`assigned`\|`cancelled`); an entry is *ready* when every listed player is in `accepted[]` ``.
- §4.2 `live/state` row: replace the contents description with `` `mode`, `courts[] {courtId, name, paused, matchId, team1[], team2[], startedAt, holding[]}`, `queue[] {pids[], eid?, ready?}`, `names {pid: displayName}`, `updatedAt`, plus host-added `hostDeviceId`, `version` ``.
- §4.2 `matches` row: replace `` `confirmedBy` `` with `` `respondedBy` (who confirmed or disputed) ``, and add `` `streaks {pid: winsInARow}`, `loggedSig`, `loggedRid` ``.
- §5.1: replace the signature line with
  `` `step({ config, participants, entries, matches, now, makeId }) → { newMatches, entryUpdates, state }` — court occupancy is derived from `matches`, so no previous state or rng is needed; results-log entries come from `pendingResults()` in `lib/results.js`. ``
- §5.3: replace "(group entry becomes `waiting` once every listed partner has accepted)" with "(a group entry is ready once every listed partner has accepted)".
- §6 route table: change `` `#/s/{sid}/tv` `` to `` `#/tv/{sid}` ``.
- §10 "Pure, node-tested" list: add `results.js`.

- [ ] **Step 2: Update `docs/INDEX.md`**

In the **Plans** table replace the `*(none yet)*` row with:

```markdown
| 2026-10-03 | [Core game logic](superpowers/plans/2026-10-03-core-game-logic.md) | Spec 1 · Plan 1/3 — pure `lib/` rules: handles, score flow, session stats, team balance, queue engine, results log. |
```

Add rows to **Architecture & core knowledge**:

```markdown
| Queue engine | `step()` in `lib/queue-engine.js` — pure; derives courts from `matches`, fills free courts per mode (fairness/stacking) and court rule; host commits its output. | `lib/queue-engine.js` header, spec §5 |
| Game rules (pure) | `handle`, `score-flow`, `session-stats`, `team-balance`, `results` in `lib/`, each with `tests/*.test.js`. | the module headers |
```

- [ ] **Step 3: Update `AGENTS.md`**

Replace the line
`` - **Pure logic** (no DOM, no Firebase): `escape`, `html`, `router.parseHash`. ``
with
`` - **Pure logic** (no DOM, no Firebase): `escape`, `html`, `router.parseHash`, `handle`, `score-flow`, `session-stats`, `team-balance`, `queue-engine`, `results`. ``

- [ ] **Step 4: Verify and commit**

Run: `npm test`
Expected: PASS, 0 failures (≈86 tests).

```bash
git add docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md docs/INDEX.md AGENTS.md
git commit -m "docs: record core-logic spec deltas; index plan 1"
```

