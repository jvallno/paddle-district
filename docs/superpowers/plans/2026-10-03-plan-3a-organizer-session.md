# Plan 3a — Organizer-Run Session Implementation Plan (Spec 1 · Plan 3a of 3a/3b/3c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One organizer device runs a whole open-play session (v1 replacement): My Sessions, create/delete, paste roster, courts that fill themselves (fairness queue + court rules), On hold, swap, cancel match, organizer scores + edit past score, rankings, history, end/continue, CSV/JSON export, share link + QR, and a public `#/tv/{sid}` live view.

**Architecture:** Spec 1's data model from day one: `sessions/{sid}` + `participants`, `matches`, and a host-written `live/state`. Any organizer device with the session open runs `lib/host.js`: it takes a lease on `sessions.host` (5 s beat, 20 s stale), runs the pure engine (`step()` via `lib/host-step.js`) on every snapshot, and commits new matches + `live/state` in one fire-and-forget batch. Every rule of play is a pure, node-tested `lib/` module; UI is vanilla ES modules with the `html` tag.

**Tech Stack:** Vanilla JS ES modules (no build); Firebase JS SDK **12.19.0** (gstatic); `qrcode-generator@2.0.4` (already used by `lib/qr.js`); `node --test`; rules tests with `@firebase/rules-unit-testing` 5.0.2 in `rules-tests/`; Java 21 for the emulators.

**Spec:** `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md` — **§13** (Plan 3 split + 3a design), plus §4.2, §5, §6, §7, §8, §9.

**Builds on:** Plan 1 (`queue-engine`, `score-flow`, `session-stats`, `team-balance`), Plan 2 (auth, profiles, rules suite, `appUrl`, `qr`). Branch: `feat/plan3a-sessions` off `next`.

**Verified in a scratch copy (2026-10-03):** every file below was built and run first — `npm test` 172 pass, `npm run test:rules` 46 pass (with two mutation checks confirming the key rules are tested), and the full browser flow in Task 7 ran clean on `?emulators`. Code blocks are that verified code; copy them exactly.

## Global Constraints

- Vanilla JS ES modules, **no build step**, no app dependencies; test tooling only in `rules-tests/` (AGENTS.md).
- Every Firebase import pins **12.19.0** (`https://www.gstatic.com/firebasejs/12.19.0/…`).
- Render with the `html` tag; `raw()` only for the generated QR SVG. Never assign a bare array to `innerHTML`. `tests/html-usage.test.js` must stay green.
- Colors, spacing, radii only from `styles/tokens.css` variables (v1 brand, spec §7). Team 1 = army green, Team 2 = gold.
- UI rules (spec §7): tap targets ≥ 44 px, inputs 48 px, body ≥ 15 px, errors inline, busy buttons say what they're doing, every empty state offers a next step, works from 320 px.
- Rules match users by Auth **uid** only; signed in = Google (`sign_in_provider == 'google.com'`).
- Floor actions are **fire-and-forget** writes stamped `clientAt`, tracked by the sync dot. Transactions only for the host lease (claim/renew/release) (spec §5.6). Deleting a session is awaited (needs a connection).
- Pure modules (`lib/roster-parse.js`, `session-model.js`, `time-format.js`, `session-export.js`, `sync-status.js`, `host-lease.js`, `host-step.js`) import **no** DOM/Firebase.
- Automated browser checks use `?emulators` only — never live data.
- Commits: one per task, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **No push, no deploy, no PR** — those need the user's explicit request.

## Review Focus

Inputs the spec implies but no unit test exercises — most likely to bite first. Each is pinned to a check in the task named:

1. **Two organizer devices open at once** (phone + laptop, or two tabs): exactly one hosts; leaving hands over within one beat; a stale host can never turn a scored game back into `playing`. → Task 3 rules test "an ended game goes back to playing" + Task 7 check B9.
2. **A snapshot arriving while the organizer is typing** in the paste box or court-rule form must not wipe what's typed (forms are mounted once; only lists re-render). → Task 6 + Task 7 check B3.
3. **Court-side Wi-Fi drops:** a score entered offline frees and refills the court locally, the sync dot says "Offline — changes will sync", and it syncs on reconnect. → Task 7 check B10.
4. **A player marked Left or On hold mid-game** finishes that game and is not queued again. → Task 2 test "a player marked Left mid-game…".
5. **The TV link opened signed out, on a phone, or after the session is deleted** shows the live view (no topbar, no boot screen) or "Session not found" — never a sign-in wall or a blank page. → Task 5 + Task 7 checks B7, B11.

## Spec deltas this plan introduces (recorded in Task 7)

- Match ids are `${courtId}_${n}` (n = sequence on that court, via `nextMatchId`), not `${courtId}_${prevMid}` — chained ids would grow without bound.
- The host steps on snapshot changes only — no 1 s tick (fairness + court rules have no time-based decisions; timers render client-side).
- The host **releases** the lease on leaving the session view (teardown / `pagehide`); ending a session clears `host`. Lease identity is **per browser tab**.
- 3a participants rule is **guests only** (`isGuest == true`, `uid == null`, `g_…` id); real-profile participants arrive in 3b.
- The TV view forces the dark theme and hides the topbar/env badge while open.

## File structure

| File | Responsibility |
|---|---|
| `lib/roster-parse.js` | Paste-a-roster parser (v1 skip patterns) + case-insensitive de-dupe (pure) |
| `lib/session-model.js` | Create-form validation, session doc, court helpers, `nextMatchId`, cancel/swap/score patches, end/continue, My Sessions grouping (pure) |
| `lib/time-format.js` | `HH:MM:SS` session clock, `M:SS` game timers (pure) |
| `lib/session-export.js` | Game history, player rows, CSV (quoted, formula-safe) / JSON, file names (pure) |
| `lib/sync-status.js` | saved / syncing / offline tracker (pure) |
| `lib/host-lease.js` | Lease decision `mine/free/taken` + claim (pure) |
| `lib/host-step.js` | One engine step → matches to create + `live/state` + skip-if-unchanged key (pure) |
| `lib/sessions.js` | Firestore watchers + organizer writes |
| `lib/host.js` | Lease loop, runs `hostStep`, commits batches |
| `lib/dialog.js` | Promise-based form dialog (score / swap / cancel / rename) |
| `firestore.rules`, `rules-tests/firestore-rules.spec.mjs` | Session rules + emulator tests |
| `lib/route-access.js`, `lib/router.js`, `lib/app.js` | `tv` public route; router `onRender` (title + focus); new routes |
| `features/home/` | My Sessions |
| `features/new-session/` | Create session |
| `features/session/` | Organizer view: `session.js` shell + `courts.js`, `players.js`, `scores.js`, `rankings.js`, `settings.js`, shared `floor.js` |
| `features/shared/rankings-table.js` | Leaderboard table (session + TV) |
| `features/tv/` | Public live view |
| `styles/base.css` | Shared `.choice`, `.check`, `.seg`, dialog, `.page--wide` |

---

### Task 1: Pure session logic (roster, session model, time, export, sync status)

**Files:**
- Create: `lib/roster-parse.js`, `lib/session-model.js`, `lib/time-format.js`, `lib/session-export.js`, `lib/sync-status.js`
- Test: `tests/roster-parse.test.js`, `tests/session-model.test.js`, `tests/session-export.test.js`, `tests/sync-status.test.js`
- Modify: `tests/queue-engine-fairness.test.js` (append two tests)

**Interfaces:**
- Consumes: `overrideScore` (`lib/score-flow.js`), `sessionStats` (`lib/session-stats.js`); test helpers `players`, `run`, `teams` (`tests/helpers/engine-fixtures.js`).
- Produces:
  - `parseNames(raw) → string[]`, `dedupeNames(names, existingNames) → { add: string[], skipped: number }`, `NAME_MAX = 40`
  - `COURT_RULES`, `MAX_COURTS = 12`, `SESSION_NAME_MAX = 60`, `VENUE_MAX = 80`, `COURT_NAME_MAX = 20`
  - `defaultCourts(n)`, `validateSessionInput(form) → { ok, value, errors }`, `newSessionDoc(uid, value, now)`, `addCourt(courts)`, `renameCourt(courts, id, name)`, `toggleCourtPaused(courts, id)`
  - `nextMatchId({ courtId, prevMid }) → 'c1_7'`
  - `cancelMatch(match, fate: 'queue'|'hold', now) → { ok, patch, hold: pid[] }`, `swapPlayer(match, outPid, inPid, inName, busyPids: Set, now) → { ok, patch }`, `enterScore(match, uid, {t1,t2}, now) → { ok, patch }` (errors: `{ ok: false, error }`)
  - `endSessionPatch(now)`, `continueSessionPatch()`, `groupSessions(sessions, today) → { live, upcoming, past }`, `localDate(Date) → 'YYYY-MM-DD'`
  - `formatElapsed(ms) → 'HH:MM:SS'`, `formatClock(ms) → 'M:SS' | 'H:MM:SS'`
  - `gameHistory(matches)`, `playerRows(participants, matches)`, `exportJson(session, participants, matches, now)`, `exportCsv(session, participants, matches) → string`, `csvCell(v)`, `exportFilename(name, date, ext)`
  - `createSyncStatus(onChange, { online }) → { track(promise), setOnline(bool), state() }`

- [ ] **Step 1: Write the failing tests**

Create `tests/roster-parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNames, dedupeNames, NAME_MAX } from '../lib/roster-parse.js';

test('parseNames keeps one name per line and strips numbering', () => {
  assert.deepEqual(parseNames('1. Ana Cruz\n2.Ben\n  Carl  \n'), ['Ana Cruz', 'Ben', 'Carl']);
});

test('parseNames skips v1 chat-export noise', () => {
  const raw = [
    'Pickleball Open Play', 'Paddle District Saturday', 'Sat, Oct 4', 'Participants (12)',
    'On hold (2)', '(3)', 'Waitlist (4)', '@everyone', '12', '7:30 PM start', '', 'x', 'Dana',
  ].join('\n');
  assert.deepEqual(parseNames(raw), ['Dana']);
});

test('parseNames removes invisible and direction-control characters', () => {
  assert.deepEqual(parseNames('‮Eve​\nFe lix\n﻿'), ['Eve', 'Fe lix']);
});

test('parseNames caps names at NAME_MAX characters', () => {
  assert.equal(parseNames('x'.repeat(60))[0].length, NAME_MAX);
});

test('parseNames handles Windows line endings and empty input', () => {
  assert.deepEqual(parseNames('Ana\r\nBen\r\n'), ['Ana', 'Ben']);
  assert.deepEqual(parseNames(''), []);
  assert.deepEqual(parseNames(undefined), []);
});

test('dedupeNames skips names already in the session or repeated, ignoring case', () => {
  assert.deepEqual(dedupeNames(['Ana', 'ben', 'BEN', 'Carl'], ['ANA']), { add: ['ben', 'Carl'], skipped: 2 });
});
```

Create `tests/session-model.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSessionInput, newSessionDoc, defaultCourts, addCourt, renameCourt, toggleCourtPaused,
  nextMatchId, cancelMatch, swapPlayer, enterScore, endSessionPatch, continueSessionPatch,
  groupSessions, localDate, MAX_COURTS,
} from '../lib/session-model.js';

const good = { name: '  Saturday   Open Play ', date: '2026-10-04', venue: 'Elm Courts', courts: '3', ruleType: 'winnersStay', maxWins: '2' };
const playing = () => ({ mid: 'c1_1', courtId: 'c1', team1: ['a', 'b'], team2: ['c', 'd'], names: { a: 'A', b: 'B', c: 'C', d: 'D' }, status: 'playing', startedAt: 100 });

test('validateSessionInput cleans a good form into a session value', () => {
  const r = validateSessionInput(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    name: 'Saturday Open Play', date: '2026-10-04', venue: 'Elm Courts',
    courts: defaultCourts(3), courtRule: { type: 'winnersStay', maxWins: 2 },
  });
});

test('validateSessionInput reports each bad field', () => {
  const r = validateSessionInput({ name: '   ', date: '04/10/2026', venue: 'v'.repeat(81), courts: '0', ruleType: 'chaos' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['courts', 'date', 'name', 'ruleType', 'venue']);
  assert.equal(validateSessionInput({ ...good, courts: String(MAX_COURTS + 1) }).ok, false);
  assert.equal(validateSessionInput({ ...good, courts: '2.5' }).ok, false);
  assert.equal(validateSessionInput({ ...good, maxWins: '9' }).errors.maxWins !== undefined, true);
});

test('validateSessionInput ignores maxWins for everyone off', () => {
  const r = validateSessionInput({ ...good, ruleType: 'everyoneOff', maxWins: 'junk' });
  assert.deepEqual(r.value.courtRule, { type: 'everyoneOff', maxWins: 2 });
});

test('newSessionDoc makes the creator the only organizer of a live fairness session', () => {
  const d = newSessionDoc('u1', validateSessionInput(good).value, 5000);
  assert.deepEqual(
    { ownerId: d.ownerId, organizerIds: d.organizerIds, mode: d.mode, status: d.status, host: d.host, shareQr: d.shareQr, startedAt: d.startedAt, endedAt: d.endedAt, guestsAllowed: d.guestsAllowed },
    { ownerId: 'u1', organizerIds: ['u1'], mode: 'fairness', status: 'live', host: null, shareQr: true, startedAt: 5000, endedAt: null, guestsAllowed: true },
  );
});

test('court helpers add, rename and pause courts', () => {
  const two = defaultCourts(2);
  assert.deepEqual(addCourt(two).at(-1), { id: 'c3', name: 'Court 3', paused: false });
  assert.deepEqual(addCourt([{ id: 'c5', name: 'X', paused: false }]).at(-1).id, 'c6');
  assert.equal(addCourt(defaultCourts(MAX_COURTS)).length, MAX_COURTS);
  assert.equal(renameCourt(two, 'c2', '  Center   court ')[1].name, 'Center court');
  assert.equal(renameCourt(two, 'c2', '   ')[1].name, 'Court 2');
  assert.equal(toggleCourtPaused(two, 'c1')[0].paused, true);
  assert.equal(toggleCourtPaused(toggleCourtPaused(two, 'c1'), 'c1')[0].paused, false);
});

test('nextMatchId counts up per court and stays short', () => {
  assert.equal(nextMatchId({ courtId: 'c1', prevMid: null }), 'c1_1');
  assert.equal(nextMatchId({ courtId: 'c1', prevMid: 'c1_9' }), 'c1_10');
  assert.equal(nextMatchId({ courtId: 'c2', prevMid: 'junk' }), 'c2_1');
});

test('cancelMatch ends the match with no score; hold puts the four On hold', () => {
  const r = cancelMatch(playing(), 'queue', 900);
  assert.deepEqual(r, { ok: true, patch: { status: 'cancelled', endedAt: 900, clientAt: 900 }, hold: [] });
  assert.deepEqual(cancelMatch(playing(), 'hold', 900).hold, ['a', 'b', 'c', 'd']);
  assert.equal(cancelMatch({ ...playing(), status: 'overridden' }, 'queue', 900).ok, false);
});

test('swapPlayer replaces one player and their name snapshot', () => {
  const r = swapPlayer(playing(), 'c', 'e', 'E', new Set(['a', 'b', 'c', 'd']), 700);
  assert.deepEqual(r.patch, { team1: ['a', 'b'], team2: ['e', 'd'], names: { a: 'A', b: 'B', d: 'D', e: 'E' }, clientAt: 700 });
  assert.equal(swapPlayer(playing(), 'z', 'e', 'E', new Set(), 1).error, 'not-in-match');
  assert.equal(swapPlayer(playing(), 'c', 'f', 'F', new Set(['f']), 1).error, 'busy');
  assert.equal(swapPlayer({ ...playing(), status: 'cancelled' }, 'c', 'e', 'E', new Set(), 1).error, 'not-playing');
});

test('enterScore overrides any match except a cancelled one', () => {
  const r = enterScore(playing(), 'u1', { t1: 11, t2: 7 }, 800);
  assert.deepEqual(r.patch, { score: { t1: 11, t2: 7 }, status: 'overridden', overriddenBy: 'u1', endedAt: 800, clientAt: 800 });
  const edited = enterScore({ ...playing(), ...r.patch }, 'u1', { t1: 11, t2: 9 }, 950);
  assert.equal(edited.patch.endedAt, 800, 'editing keeps the original end time');
  assert.equal(enterScore({ ...playing(), status: 'cancelled' }, 'u1', { t1: 1, t2: 0 }, 1).ok, false);
  assert.equal(enterScore(playing(), 'u1', { t1: 100, t2: 0 }, 1).ok, false);
});

test('end and continue session patches', () => {
  assert.deepEqual(endSessionPatch(42), { status: 'ended', endedAt: 42, host: null });
  assert.deepEqual(continueSessionPatch(), { status: 'live', endedAt: null });
});

test('groupSessions sorts live, upcoming and past', () => {
  const s = (id, date, status = 'live') => ({ id, date, status, startedAt: 0 });
  const g = groupSessions([s('a', '2026-10-01'), s('b', '2026-10-09'), s('c', '2026-10-03'), s('d', '2026-09-01', 'ended'), s('e', '2026-10-02', 'ended'), s('f', '2026-10-05')], '2026-10-03');
  assert.deepEqual(g.live.map((x) => x.id), ['c', 'a']);
  assert.deepEqual(g.upcoming.map((x) => x.id), ['f', 'b']);
  assert.deepEqual(g.past.map((x) => x.id), ['e', 'd']);
});

test('localDate formats in local time', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
```

Create `tests/session-export.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHistory, playerRows, exportJson, exportCsv, csvCell, exportFilename } from '../lib/session-export.js';

const session = { name: 'Sat Open', date: '2026-10-04', venue: 'Elm', courts: [{ id: 'c1', name: 'Center' }], startedAt: 0, endedAt: 3_600_000 };
const participants = [
  { pid: 'g_b', displayName: 'Ben', status: 'here', checkedInAt: 2 },
  { pid: 'g_a', displayName: 'Ana', status: 'break', checkedInAt: 1 },
  { pid: 'g_c', displayName: 'Carl', status: 'here', checkedInAt: 3 },
  { pid: 'g_d', displayName: '=HYPERLINK("x")', status: 'here', checkedInAt: 4 },
  { pid: 'g_e', displayName: 'Eve', status: 'left', checkedInAt: 5 },
];
const names = { g_a: 'Ana', g_b: 'Ben', g_c: 'Carl', g_d: '=HYPERLINK("x")' };
const m = (mid, startedAt, status, score) => ({ mid, courtId: 'c1', team1: ['g_a', 'g_b'], team2: ['g_c', 'g_d'], names, startedAt, endedAt: startedAt + 600_000, status, score });
const matches = [
  m('c1_2', 2_000_000, 'overridden', { t1: 9, t2: 11 }),
  m('c1_1', 1_000_000, 'overridden', { t1: 11, t2: 5 }),
  m('c1_3', 2_500_000, 'cancelled', null),
  { ...m('c1_4', 3_000_000, 'playing', null), endedAt: null },
];

test('gameHistory keeps scored games in play order', () => {
  assert.deepEqual(gameHistory(matches).map((x) => x.mid), ['c1_1', 'c1_2']);
});

test('playerRows lists every participant in roster order with zeros for no games', () => {
  const rows = playerRows(participants, matches);
  assert.deepEqual(rows.map((r) => r.name), ['Ana', 'Ben', 'Carl', '=HYPERLINK("x")', 'Eve']);
  assert.deepEqual(rows[0], { name: 'Ana', present: false, gamesPlayed: 2, wins: 1, losses: 1, points: 20, pointsAgainst: 16, winPct: 50, ptPct: 56 });
  assert.equal(rows[4].gamesPlayed, 0);
});

test('exportJson has v1 session, players and gameHistory sections', () => {
  const j = exportJson(session, participants, matches, 9_999_999);
  assert.deepEqual(j.session, { name: 'Sat Open', date: '2026-10-04', venue: 'Elm', startTime: '1970-01-01T00:00:00.000Z', endTime: '1970-01-01T01:00:00.000Z', duration: '1:00:00' });
  assert.deepEqual(j.gameHistory[0], { round: 1, court: 'Center', duration: '10:00', team1: ['Ana', 'Ben'], team2: ['Carl', '=HYPERLINK("x")'], score1: 11, score2: 5 });
});

test('csvCell quotes commas/quotes/newlines and defuses formulas', () => {
  assert.equal(csvCell('Ana'), 'Ana');
  assert.equal(csvCell('Cruz, Ana'), '"Cruz, Ana"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(-3), "'-3");
  assert.equal(csvCell(null), '');
});

test('exportCsv writes the players table then the game history', () => {
  const lines = exportCsv(session, participants, matches).split('\n');
  assert.equal(lines[0], 'Name,Present,Games,Wins,Losses,Points,Points Against,Win%,Pt%');
  assert.equal(lines[1], 'Ana,No,2,1,1,20,16,50%,56%');
  assert.equal(lines[4], `"'=HYPERLINK(""x"")",Yes,2,1,1,16,20,50%,44%`);
  assert.equal(lines[6], '');
  assert.equal(lines[7], 'Round,Court,Duration,Team A,Team B,Score A,Score B');
  assert.equal(lines[8], '1,Center,10:00,Ana & Ben,"Carl & =HYPERLINK(""x"")",11,5');
  assert.equal(lines.length, 10);
});

test('exportFilename makes a safe file name', () => {
  assert.equal(exportFilename('Sat  Open/Play!', '2026-10-04', 'csv'), 'Sat-Open-Play-2026-10-04.csv');
  assert.equal(exportFilename('***', '2026-10-04', 'json'), 'session-2026-10-04.json');
});
```

Create `tests/sync-status.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncStatus } from '../lib/sync-status.js';

test('sync status: saved → syncing while writes are pending → saved', async () => {
  const seen = [];
  const sync = createSyncStatus((s) => seen.push(s));
  let ok;
  const p = new Promise((r) => { ok = r; });
  sync.track(p);
  sync.track(Promise.reject(new Error('denied'))).catch(() => {});
  assert.equal(sync.state(), 'syncing');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sync.state(), 'syncing', 'one write still pending');
  ok();
  await p;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['saved', 'syncing', 'saved']);
});

test('sync status: offline wins until back online', () => {
  const seen = [];
  const sync = createSyncStatus((s) => seen.push(s), { online: false });
  sync.setOnline(true);
  assert.deepEqual(seen, ['offline', 'saved']);
});
```

Append to `tests/queue-engine-fairness.test.js` (pins two engine behaviours 3a relies on — they already pass, no engine change):

```js
test('cancelled match: no stayers, players go to the back, court refills', () => {
  const cancelled = { mid: 'm1', courtId: 'c1', team1: ['a', 'b'], team2: ['c', 'd'], status: 'cancelled', startedAt: 10, endedAt: 20, score: null };
  const out = run({ rule: { type: 'winnersStay', maxWins: 2 }, participants: players('a b c d e f g h'), matches: [cancelled] });
  assert.deepEqual(teams(out).flat().sort(), ['e', 'f', 'g', 'h']);
  assert.deepEqual(out.state.queue.map((q) => q.pids[0]).sort(), ['a', 'b', 'c', 'd']);
});

test('guests without a self-rating still get balanced teams', () => {
  const out = run({ participants: players('a b c d', { a: { selfRating: null }, b: { selfRating: undefined }, c: { selfRating: null }, d: { selfRating: null } }) });
  assert.equal(out.newMatches.length, 1);
  assert.equal(teams(out).flat().length, 4);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/lib/roster-parse.js'` (and the same for `session-model`, `session-export`, `sync-status`). The two appended engine tests pass.

- [ ] **Step 3: Implement the modules**

Create `lib/roster-parse.js`:

```js
// Paste-a-roster (v1 parity): turns a pasted list — often copied from a group
// chat — into player names. Pure — node-tested. Keeps v1's skip patterns
// (headers, dates, "Participants (12)", times, @mentions, bare numbers) and
// strips "1." numbering and invisible characters.

const SKIP = [
  /^pickleball/i, /^paddle district/i, /^(sun|mon|tue|wed|thu|fri|sat),/i,
  /^participants\s*\(/i, /^on hold\s*\(/i, /^\(\d+\)\s*$/, /^[a-z ]+\s*\(\d+\)\s*$/i,
  /^@/, /^\d+$/, /\d:\d{2}\s*(AM|PM)/i,
];
export const NAME_MAX = 40;

export function parseNames(raw) {
  return String(raw ?? '')
    .split('\n')
    .map((line) => line
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u00A0]/g, ' ')
      .trim()
      .replace(/^\d+\.\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX)
      .trim())
    .filter((l) => l.length >= 2 && !SKIP.some((p) => p.test(l)));
}

// Splits parsed names into the ones to add and the ones already in the session
// (or repeated in the paste), compared case-insensitively — v1's duplicate rule.
export function dedupeNames(names, existingNames = []) {
  const seen = new Set(existingNames.map((n) => n.toLowerCase()));
  const add = [];
  let skipped = 0;
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    add.push(name);
  }
  return { add, skipped };
}
```

Create `lib/session-model.js`:

```js
// Session shapes and organizer actions as plain data (spec §13). Pure —
// node-tested. lib/sessions.js turns these into Firestore writes.
import { overrideScore } from './score-flow.js';

export const COURT_RULES = ['everyoneOff', 'winnersStay', 'winnersSplit'];
export const MAX_COURTS = 12;
export const SESSION_NAME_MAX = 60;
export const VENUE_MAX = 80;
export const COURT_NAME_MAX = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function defaultCourts(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}`, paused: false }));
}

// Create-session form → { ok, value, errors }. value is ready for newSessionDoc().
export function validateSessionInput({ name, date, venue, courts, ruleType, maxWins } = {}) {
  const errors = {};
  const n = clean(name);
  if (!n) errors.name = 'Give the session a name.';
  else if (n.length > SESSION_NAME_MAX) errors.name = `Keep it under ${SESSION_NAME_MAX} characters.`;
  const d = String(date ?? '');
  if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) errors.date = 'Pick a date.';
  const v = clean(venue);
  if (v.length > VENUE_MAX) errors.venue = `Keep it under ${VENUE_MAX} characters.`;
  const c = Number(courts);
  if (!Number.isInteger(c) || c < 1 || c > MAX_COURTS) errors.courts = `Between 1 and ${MAX_COURTS} courts.`;
  const type = COURT_RULES.includes(ruleType) ? ruleType : null;
  if (!type) errors.ruleType = 'Pick a court rule.';
  const w = Number(maxWins ?? 2);
  if (type && type !== 'everyoneOff' && (!Number.isInteger(w) || w < 1 || w > 5)) errors.maxWins = 'Between 1 and 5 wins.';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok ? { name: n, date: d, venue: v, courts: defaultCourts(c), courtRule: { type, maxWins: type === 'everyoneOff' ? 2 : w } } : null,
  };
}

// The sessions/{sid} doc (createdAt is added by the service as a server timestamp).
export function newSessionDoc(uid, value, now) {
  return {
    name: value.name,
    date: value.date,
    venue: value.venue,
    ownerId: uid,
    organizerIds: [uid],
    courts: value.courts,
    mode: 'fairness',
    courtRule: value.courtRule,
    guestsAllowed: true,
    status: 'live',
    host: null,
    shareQr: true,
    startedAt: now,
    endedAt: null,
  };
}

export function addCourt(courts) {
  if (courts.length >= MAX_COURTS) return courts;
  const next = Math.max(0, ...courts.map((c) => Number(c.id.slice(1)) || 0)) + 1;
  return [...courts, { id: `c${next}`, name: `Court ${next}`, paused: false }];
}

export function renameCourt(courts, id, name) {
  const n = clean(name).slice(0, COURT_NAME_MAX);
  if (!n) return courts;
  return courts.map((c) => (c.id === id ? { ...c, name: n } : c));
}

export function toggleCourtPaused(courts, id) {
  return courts.map((c) => (c.id === id ? { ...c, paused: !c.paused } : c));
}

// Deterministic match ids (carried forward from Plan 1): court id + sequence
// on that court, so two devices stepping the same state agree on the id.
export function nextMatchId({ courtId, prevMid }) {
  const prev = prevMid ? Number(String(prevMid).split('_').pop()) : 0;
  return `${courtId}_${(Number.isInteger(prev) ? prev : 0) + 1}`;
}

// Cancel match (v1 parity): no score; endedAt sends the four to the back of
// the line. fate 'hold' also puts them On hold.
export function cancelMatch(match, fate, now) {
  if (match.status !== 'playing') return { ok: false, error: 'not-playing' };
  const pids = [...match.team1, ...match.team2];
  return {
    ok: true,
    patch: { status: 'cancelled', endedAt: now, clientAt: now },
    hold: fate === 'hold' ? pids : [],
  };
}

// Swap one player on a live court for someone not on any court.
export function swapPlayer(match, outPid, inPid, inName, busyPids, now) {
  if (match.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (![...match.team1, ...match.team2].includes(outPid)) return { ok: false, error: 'not-in-match' };
  if (busyPids.has(inPid)) return { ok: false, error: 'busy' };
  const swap = (team) => team.map((p) => (p === outPid ? inPid : p));
  const names = { ...match.names, [inPid]: inName };
  delete names[outPid];
  return { ok: true, patch: { team1: swap(match.team1), team2: swap(match.team2), names, clientAt: now } };
}

// Organizer-entered score (3a) and "edit past score" — both are overrides.
// Cancelled matches can't be scored.
export function enterScore(match, uid, score, now) {
  if (match.status === 'cancelled') return { ok: false, error: 'cancelled' };
  return overrideScore(match, uid, score, now);
}

export function endSessionPatch(now) {
  return { status: 'ended', endedAt: now, host: null };
}

export function continueSessionPatch() {
  return { status: 'live', endedAt: null };
}

// My Sessions grouping: live (today or earlier) → upcoming → past.
// today is 'YYYY-MM-DD' in the device's local time.
export function groupSessions(sessions, today) {
  const live = [];
  const upcoming = [];
  const past = [];
  for (const s of sessions) {
    if (s.status === 'ended') past.push(s);
    else if (s.date > today) upcoming.push(s);
    else live.push(s);
  }
  const asc = (a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0);
  live.sort((a, b) => -asc(a, b));
  upcoming.sort(asc);
  past.sort((a, b) => -asc(a, b));
  return { live, upcoming, past };
}

// Local 'YYYY-MM-DD' for a Date (the create form's default date).
export function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

Create `lib/time-format.js`:

```js
// Clock strings for timers. Pure — node-tested.

const pad = (n) => String(n).padStart(2, '0');

// Session clock (v1): 'HH:MM:SS'. Negative or missing → '00:00:00'.
export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Court / game timer: 'M:SS', or 'H:MM:SS' past an hour.
export function formatClock(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
```

Create `lib/session-export.js`:

```js
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
```

Create `lib/sync-status.js`:

```js
// Saved / syncing / offline indicator (spec §9, §13.7). Pure — node-tested.
// track(promise) for every fire-and-forget write; a write is "syncing" until
// the server acknowledges it (offline writes stay pending until reconnect).
//   const sync = createSyncStatus((s) => render(s));   s: 'saved' | 'syncing' | 'offline'
export function createSyncStatus(onChange, { online = true } = {}) {
  let pending = 0;
  let isOnline = online;
  let last = null;
  const state = () => (!isOnline ? 'offline' : pending > 0 ? 'syncing' : 'saved');
  const emit = () => { const s = state(); if (s !== last) { last = s; onChange(s); } };
  emit();
  return {
    track(promise) {
      pending += 1;
      emit();
      const settle = () => { pending -= 1; emit(); };
      promise.then(settle, settle);
      return promise;
    },
    setOnline(value) { isOnline = value; emit(); },
    state,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/roster-parse.js lib/session-model.js lib/time-format.js lib/session-export.js lib/sync-status.js tests/roster-parse.test.js tests/session-model.test.js tests/session-export.test.js tests/sync-status.test.js tests/queue-engine-fairness.test.js
git commit -m "feat(sessions): pure session logic — roster parse, session model, export, timers, sync status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure host logic (lease + engine step)

**Files:**
- Create: `lib/host-lease.js`, `lib/host-step.js`
- Test: `tests/host.test.js`

**Interfaces:**
- Consumes: `step` (`lib/queue-engine.js`), `nextMatchId` (Task 1), `formatElapsed`/`formatClock` (Task 1), `players` test helper.
- Produces:
  - `BEAT_MS = 5000`, `LEASE_MS = 20000`, `leaseState(host, deviceId, now) → 'mine'|'free'|'taken'`, `claimHost(prev, deviceId, uid, now) → { deviceId, uid, beatAt, version }`
  - `hostStep({ session, participants, matches, now, deviceId, lastKey }) → { matches: [{ mid, data }], state, stateKey, write: boolean }` — `participants` are `{ pid, ...doc }`, `matches` are `{ mid, ...doc }`, all times ms numbers.

- [ ] **Step 1: Write the failing test**

Create `tests/host.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaseState, claimHost, LEASE_MS } from '../lib/host-lease.js';
import { hostStep } from '../lib/host-step.js';
import { formatElapsed, formatClock } from '../lib/time-format.js';
import { players } from './helpers/engine-fixtures.js';

const host = (deviceId, beatAt, version = 1) => ({ deviceId, uid: 'u1', beatAt, version });

test('leaseState: mine, free (none or stale) and taken', () => {
  assert.equal(leaseState(null, 'd1', 1000), 'free');
  assert.equal(leaseState(host('d1', 0), 'd1', 999_999), 'mine');
  assert.equal(leaseState(host('d2', 1000), 'd1', 1000 + LEASE_MS), 'taken');
  assert.equal(leaseState(host('d2', 1000), 'd1', 1001 + LEASE_MS), 'free');
  assert.equal(leaseState({ deviceId: 'd2', beatAt: 'junk' }, 'd1', 5), 'free');
});

test('claimHost bumps the version', () => {
  assert.deepEqual(claimHost(host('d2', 0, 4), 'd1', 'u1', 50), { deviceId: 'd1', uid: 'u1', beatAt: 50, version: 5 });
  assert.equal(claimHost(null, 'd1', 'u1', 50).version, 1);
});

const session = { mode: 'fairness', courtRule: { type: 'everyoneOff' }, courts: [{ id: 'c1', name: 'Court 1', paused: false }, { id: 'c2', name: 'Court 2', paused: true }], host: host('d1', 0, 3) };

test('hostStep starts a match with a deterministic id and an empty score', () => {
  const r = hostStep({ session, participants: players('a b c d e'), matches: [], now: 500, deviceId: 'd1' });
  assert.equal(r.write, true);
  assert.equal(r.matches.length, 1, 'paused court stays empty');
  assert.equal(r.matches[0].mid, 'c1_1');
  assert.deepEqual(
    { status: r.matches[0].data.status, score: r.matches[0].data.score, endedAt: r.matches[0].data.endedAt, startedAt: r.matches[0].data.startedAt, clientAt: r.matches[0].data.clientAt },
    { status: 'playing', score: null, endedAt: null, startedAt: 500, clientAt: 500 },
  );
  assert.equal(r.state.hostDeviceId, 'd1');
  assert.equal(r.state.version, 3);
  assert.deepEqual(r.state.queue.map((q) => q.pids[0]), ['e']);
});

test('hostStep skips the write when nothing changed (only time moved)', () => {
  const first = hostStep({ session, participants: players('a b c d e'), matches: [], now: 500, deviceId: 'd1' });
  const started = first.matches.map(({ mid, data }) => ({ mid, ...data }));
  const again = hostStep({ session, participants: players('a b c d e'), matches: started, now: 501, deviceId: 'd1', lastKey: null });
  assert.equal(again.matches.length, 0);
  const third = hostStep({ session, participants: players('a b c d e'), matches: started, now: 9000, deviceId: 'd1', lastKey: again.stateKey });
  assert.equal(third.write, false);
});

test('hostStep: a cancelled match frees the court and its players go to the back', () => {
  const ps = players('a b c d e f g h');
  const cancelled = { mid: 'c1_1', courtId: 'c1', team1: ['a', 'b'], team2: ['c', 'd'], status: 'cancelled', startedAt: 100, endedAt: 200, score: null };
  const r = hostStep({ session, participants: ps, matches: [cancelled], now: 300, deviceId: 'd1' });
  assert.equal(r.matches[0].mid, 'c1_2');
  assert.deepEqual([...r.matches[0].data.team1, ...r.matches[0].data.team2].sort(), ['e', 'f', 'g', 'h']);
});

test('formatElapsed and formatClock', () => {
  assert.equal(formatElapsed(3_723_000), '01:02:03');
  assert.equal(formatElapsed(-5), '00:00:00');
  assert.equal(formatClock(65_000), '1:05');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(formatClock(undefined), '0:00');
});

test('hostStep: a player marked Left mid-game finishes it but is not queued again', () => {
  const ps = players('a b c d e f g h', { a: { status: 'left' } });
  const playing = { mid: 'c1_1', courtId: 'c1', team1: ['a', 'b'], team2: ['c', 'd'], status: 'playing', startedAt: 100, endedAt: null, score: null };
  const during = hostStep({ session, participants: ps, matches: [playing], now: 300, deviceId: 'd1' });
  assert.deepEqual(during.state.courts[0].team1, ['a', 'b'], 'still shown on court');
  const ended = { ...playing, status: 'overridden', score: { t1: 11, t2: 5 }, endedAt: 400 };
  const after = hostStep({ session, participants: ps, matches: [ended], now: 500, deviceId: 'd1' });
  const everyone = [...after.matches[0].data.team1, ...after.matches[0].data.team2, ...after.state.queue.flatMap((q) => q.pids)];
  assert.equal(everyone.includes('a'), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/host.test.js`
Expected: FAIL — `Cannot find module '…/lib/host-lease.js'`.

- [ ] **Step 3: Implement**

Create `lib/host-lease.js`:

```js
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
```

Create `lib/host-step.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/host-lease.js lib/host-step.js tests/host.test.js
git commit -m "feat(sessions): pure host lease + engine step with deterministic match ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Session security rules + emulator tests

**Files:**
- Modify: `firestore.rules` (full replacement below), `rules-tests/firestore-rules.spec.mjs` (rename one test, append a block)

**Interfaces:**
- Consumes: the existing rules suite (`as()`, `anon()`, `env`, imports already include `query`, `where`, `writeBatch`, `serverTimestamp`).
- Produces (Tasks 4–6 rely on these being allowed): owner creates `sessions/{sid}` with `ownerId == organizerIds[0] == uid`, `status: 'live'`, `createdAt: serverTimestamp()`; organizers update the session (incl. `host`, `courts`, `courtRule`, `shareQr`, `status`, `endedAt`); organizers write guest `participants/g_…`, `matches/*` and `live/state`; public `get` on sessions and read on `matches` + `live`; `list` sessions only via `where('organizerIds', 'array-contains', uid)`.

- [ ] **Step 1: Write the failing tests**

In `rules-tests/firestore-rules.spec.mjs`, rename the existing test `'attack: anything outside users/handles'` to `'attack: malformed session doc; results not open yet'` (its body stays: the session doc it writes is malformed, and `results` stays closed in 3a).

Append to the end of the file:

```js
// ── Sessions (spec §13.5) ───────────────────────────────────────────────────
// ana owns session s1 (with a guest g_ana1 and a live game c1_1); carl is a
// signed-in stranger; anon is the public TV view.
const sessionData = (over = {}) => ({
  name: 'Sat Open', date: '2026-10-04', venue: 'Elm', ownerId: 'ana', organizerIds: ['ana'],
  courts: [{ id: 'c1', name: 'Court 1', paused: false }], mode: 'fairness',
  courtRule: { type: 'everyoneOff', maxWins: 2 }, guestsAllowed: true, status: 'live', host: null,
  shareQr: true, startedAt: 1000, endedAt: null, createdAt: serverTimestamp(), ...over,
});
const guest = (over = {}) => ({ uid: null, isGuest: true, displayName: 'Dana', selfRating: null, status: 'here', checkedInAt: 1, clientAt: 1, ...over });
const game = (over = {}) => ({
  courtId: 'c1', team1: ['g_ana1', 'g_ana2'], team2: ['g_ana3', 'g_ana4'], names: {}, startedAt: 2000,
  endedAt: null, score: null, status: 'playing', streaks: {}, clientAt: 2000, ...over,
});

async function seedSession() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'sessions/s1'), sessionData({ createdAt: new Date(0) }));
    await setDoc(doc(db, 'sessions/s1/participants/g_ana1'), guest());
    await setDoc(doc(db, 'sessions/s1/matches/c1_1'), game());
    await setDoc(doc(db, 'sessions/s1/live/state'), { courts: [], queue: [], names: {} });
  });
}

test('attack: list sessions you do not organize', async () => {
  await seedSession();
  await assertFails(getDocs(collection(as('carl'), 'sessions')));
  await assertFails(getDocs(query(collection(anon(), 'sessions'), where('organizerIds', 'array-contains', 'ana'))));
});
test('attack: create a session owned by someone else or with extra organizers', async () => {
  await assertFails(setDoc(doc(as('carl'), 'sessions/s2'), sessionData()));
  await assertFails(setDoc(doc(as('carl'), 'sessions/s2'), sessionData({ ownerId: 'carl', organizerIds: ['carl', 'ana'] })));
  await assertFails(setDoc(doc(anon(), 'sessions/s2'), sessionData({ ownerId: 'carl', organizerIds: ['carl'] })));
});
test('attack: create a malformed session', async () => {
  for (const bad of [{ name: '' }, { courts: [] }, { mode: 'chaos' }, { status: 'ended' }, { date: 'tomorrow' }, { extra: 1 }, { createdAt: new Date(0) }]) {
    await assertFails(setDoc(doc(as('carl'), 'sessions/s2'), sessionData({ ownerId: 'carl', organizerIds: ['carl'], ...bad })), JSON.stringify(bad));
  }
});
test("attack: edit, end or delete someone else's session", async () => {
  await seedSession();
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1'), { name: 'Mine now' }));
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1'), { status: 'ended' }));
  await assertFails(deleteDoc(doc(as('carl'), 'sessions/s1')));
});
test('attack: owner hands the session away or rewrites createdAt', async () => {
  await seedSession();
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1'), { ownerId: 'carl', organizerIds: ['carl'] }));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1'), { organizerIds: ['carl'] }));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1'), { createdAt: new Date(5) }));
});
test('attack: stranger adds, edits or reads players', async () => {
  await seedSession();
  await assertFails(setDoc(doc(as('carl'), 'sessions/s1/participants/g_carl1'), guest()));
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1/participants/g_ana1'), { status: 'left' }));
  await assertFails(getDoc(doc(anon(), 'sessions/s1/participants/g_ana1')));
});
test('attack: organizer writes a non-guest or malformed participant (3a is guests only)', async () => {
  await seedSession();
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/ben'), guest({ uid: 'ben', isGuest: false })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_x'), guest()));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_dana1'), guest({ status: 'vip' })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_dana1'), guest({ displayName: '' })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/participants/g_dana1'), guest({ uid: 'ben' })));
});
test('attack: stranger creates, scores or deletes games, or writes the live state', async () => {
  await seedSession();
  await assertFails(setDoc(doc(as('carl'), 'sessions/s1/matches/c1_2'), game()));
  await assertFails(updateDoc(doc(as('carl'), 'sessions/s1/matches/c1_1'), { status: 'overridden', score: { t1: 11, t2: 0 } }));
  await assertFails(deleteDoc(doc(as('carl'), 'sessions/s1/matches/c1_1')));
  await assertFails(setDoc(doc(as('carl'), 'sessions/s1/live/state'), { courts: [] }));
  await assertFails(setDoc(doc(anon(), 'sessions/s1/live/state'), { courts: [] }));
});
test('attack: an ended game goes back to playing, or a bad score', async () => {
  await seedSession();
  await updateDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), { status: 'overridden', score: { t1: 11, t2: 4 }, endedAt: 3000 });
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), game()));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), { score: { t1: 100, t2: 4 } }));
  await assertFails(updateDoc(doc(as('ana'), 'sessions/s1/matches/c1_1'), { score: { t1: 11.5, t2: 4 } }));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/matches/c1_2'), game({ status: 'overridden' })));
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1/matches/c1_3'), game({ hacked: true })));
});

test('owner creates, lists, edits, ends, continues and deletes a session', async () => {
  const db = as('ana');
  await assertSucceeds(setDoc(doc(db, 'sessions/s2'), sessionData()));
  await assertSucceeds(getDocs(query(collection(db, 'sessions'), where('organizerIds', 'array-contains', 'ana'))));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { courts: [{ id: 'c1', name: 'Center', paused: true }], courtRule: { type: 'winnersStay', maxWins: 3 }, shareQr: false }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { host: { deviceId: 'd1', uid: 'ana', beatAt: 5, version: 1 } }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { status: 'ended', endedAt: 9000, host: null }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s2'), { status: 'live', endedAt: null }));
  await assertSucceeds(deleteDoc(doc(db, 'sessions/s2')));
});
test('host claims the lease in a transaction', async () => {
  await seedSession();
  const { runTransaction } = await import('firebase/firestore');
  const db = as('ana');
  await assertSucceeds(runTransaction(db, async (tx) => {
    const s = await tx.get(doc(db, 'sessions/s1'));
    tx.update(s.ref, { host: { deviceId: 'd1', uid: 'ana', beatAt: 5, version: (s.data().host?.version ?? 0) + 1 } });
  }));
});
test('anyone can read a session, its games and live state (TV view)', async () => {
  await seedSession();
  await assertSucceeds(getDoc(doc(anon(), 'sessions/s1')));
  await assertSucceeds(getDocs(collection(anon(), 'sessions/s1/matches')));
  await assertSucceeds(getDoc(doc(anon(), 'sessions/s1/live/state')));
});
test('organizer runs the floor: guests, games, scores, swaps, cancels, live state', async () => {
  await seedSession();
  const db = as('ana');
  const b = writeBatch(db);
  b.set(doc(db, 'sessions/s1/participants/g_dana1'), guest());
  b.set(doc(db, 'sessions/s1/participants/g_eve01'), guest({ displayName: 'Eve', status: 'break' }));
  await assertSucceeds(b.commit());
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/participants/g_dana1'), { status: 'left', clientAt: 2 }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_1'), { team2: ['g_ana3', 'g_dana1'], names: { g_dana1: 'Dana' }, clientAt: 3 }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_1'), { status: 'overridden', score: { t1: 11, t2: 9 }, overriddenBy: 'ana', endedAt: 4000 }));
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_1'), { score: { t1: 11, t2: 7 } }));
  const h = writeBatch(db);
  h.set(doc(db, 'sessions/s1/matches/c1_2'), game({ startedAt: 5000 }));
  h.set(doc(db, 'sessions/s1/live/state'), { courts: [], queue: [], names: {}, hostDeviceId: 'd1', version: 1 });
  await assertSucceeds(h.commit());
  await assertSucceeds(updateDoc(doc(db, 'sessions/s1/matches/c1_2'), { status: 'cancelled', endedAt: 6000, clientAt: 6000 }));
});
test('owner deletes a session: children first, then the session', async () => {
  await seedSession();
  const db = as('ana');
  const b = writeBatch(db);
  b.delete(doc(db, 'sessions/s1/participants/g_ana1'));
  b.delete(doc(db, 'sessions/s1/matches/c1_1'));
  b.delete(doc(db, 'sessions/s1/live/state'));
  await assertSucceeds(b.commit());
  await assertSucceeds(deleteDoc(doc(db, 'sessions/s1')));
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm run test:rules`
Expected: FAIL — the "normal use" session tests (`owner creates, lists…`, `organizer runs the floor…`, `anyone can read…`) are denied because no session rules exist yet.

- [ ] **Step 3: Write the rules**

Replace the whole of `firestore.rules`:

```
rules_version = '2';

// Paddle District security rules — the real security boundary (UI checks are
// cosmetic). Every change here needs rules-tests/ updated: attacks denied,
// normal flows allowed. Users are matched by Auth uid only, never email.
service cloud.firestore {
  match /databases/{database}/documents {
    // Verified = signed in with Google (spec §2), enforced here, not just in the UI.
    function signedIn() {
      return request.auth != null && request.auth.token.firebase.sign_in_provider == 'google.com';
    }
    function isSelf(uid) { return signedIn() && request.auth.uid == uid; }

    // Public profile (spec §4.1). Badge fields are deliberately not allowed:
    // they arrive with the "Pro" stage and are never self-written.
    function validProfile(d) {
      return d.keys().hasOnly(['displayName', 'handle', 'photoURL', 'selfRating', 'createdAt'])
        && d.keys().hasAll(['displayName', 'handle', 'photoURL', 'selfRating', 'createdAt'])
        && d.displayName is string && d.displayName.size() >= 1 && d.displayName.size() <= 40
        && d.displayName.matches('.*\\S.*')
        && !d.displayName.matches('.*[\\x{200B}-\\x{200F}\\x{202A}-\\x{202E}\\x{2066}-\\x{2069}\\x{FEFF}].*')
        && d.handle is string && d.handle.matches('^[a-z0-9_]{3,20}$')
        && d.photoURL is string && d.photoURL.size() <= 1000
        && (d.photoURL == '' || d.photoURL.matches('https://[a-z0-9-]+[.]googleusercontent[.]com/.*'))
        && (d.selfRating is int || d.selfRating is float)
        && d.selfRating >= 2 && d.selfRating <= 8
        && d.selfRating * 2 == math.floor(d.selfRating * 2);
    }

    match /users/{uid} {
      allow get: if signedIn();
      // Capped listing: organizer search (Plan 3) always uses limit(<=25).
      allow list: if signedIn() && request.query.limit <= 25;
      // Created once, in the same batch that claims handles/{handle}.
      allow create: if isSelf(uid)
        && validProfile(request.resource.data)
        && request.resource.data.createdAt == request.time
        && getAfter(/databases/$(database)/documents/handles/$(request.resource.data.handle)).data.uid == uid;
      // Handle and createdAt are fixed after creation.
      allow update: if isSelf(uid)
        && validProfile(request.resource.data)
        && request.resource.data.handle == resource.data.handle
        && request.resource.data.createdAt == resource.data.createdAt;
      allow delete: if false;
    }

    // handles/{handle} → { uid }: makes @handles unique. Claimable only while
    // creating your profile (so one handle per account); never moved or freed.
    match /handles/{handle} {
      allow get: if signedIn();
      allow list: if false;
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['uid'])
        && request.resource.data.uid == request.auth.uid
        && handle.matches('^[a-z0-9_]{3,20}$')
        && !exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.handle == handle;
      allow update, delete: if false;
    }

    // ── Sessions (spec §4.2, §13.5) ──────────────────────────────────────────
    function sessionDoc(sid) { return get(/databases/$(database)/documents/sessions/$(sid)).data; }
    function isOrganizer(sid) { return signedIn() && request.auth.uid in sessionDoc(sid).organizerIds; }
    function isNum(v) { return v is int || v is float; }
    function optNum(v) { return v == null || isNum(v); }

    function validSession(d) {
      return d.keys().hasOnly(['name', 'date', 'venue', 'ownerId', 'organizerIds', 'courts', 'mode', 'courtRule',
          'guestsAllowed', 'status', 'host', 'shareQr', 'startedAt', 'endedAt', 'createdAt'])
        && d.keys().hasAll(['name', 'date', 'venue', 'ownerId', 'organizerIds', 'courts', 'mode', 'courtRule',
          'guestsAllowed', 'status', 'host', 'shareQr', 'startedAt', 'endedAt', 'createdAt'])
        && d.name is string && d.name.size() >= 1 && d.name.size() <= 60
        && d.date is string && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && d.venue is string && d.venue.size() <= 80
        && d.organizerIds is list && d.organizerIds.size() >= 1 && d.organizerIds.size() <= 10
        && d.courts is list && d.courts.size() >= 1 && d.courts.size() <= 12
        && d.mode in ['fairness', 'stacking']
        && d.courtRule is map && d.courtRule.type in ['everyoneOff', 'winnersStay', 'winnersSplit']
        && d.guestsAllowed is bool && d.shareQr is bool
        && d.status in ['live', 'ended']
        && (d.host == null || d.host is map)
        && isNum(d.startedAt) && optNum(d.endedAt);
    }

    match /sessions/{sid} {
      // Anyone may open a session by id (the public TV view); only your own
      // sessions can be listed, so nobody can enumerate other people's.
      allow get: if true;
      allow list: if signedIn() && request.auth.uid in resource.data.organizerIds;
      allow create: if signedIn()
        && validSession(request.resource.data)
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.organizerIds == [request.auth.uid]
        && request.resource.data.status == 'live'
        && request.resource.data.createdAt == request.time;
      allow update: if signedIn() && request.auth.uid in resource.data.organizerIds
        && validSession(request.resource.data)
        && request.resource.data.createdAt == resource.data.createdAt
        && (request.auth.uid == resource.data.ownerId
            || !request.resource.data.diff(resource.data).affectedKeys().hasAny(['ownerId', 'organizerIds']))
        && request.resource.data.ownerId == resource.data.ownerId
        && request.resource.data.ownerId in request.resource.data.organizerIds;
      allow delete: if signedIn() && request.auth.uid == resource.data.ownerId;

      // Players in this session. 3a: organizers add name-only guests; player
      // self check-in arrives in 3b.
      match /participants/{pid} {
        allow read: if signedIn();
        allow create, update: if isOrganizer(sid)
          && request.resource.data.keys().hasOnly(['uid', 'isGuest', 'displayName', 'selfRating', 'status', 'checkedInAt', 'clientAt'])
          && request.resource.data.displayName is string
          && request.resource.data.displayName.size() >= 1 && request.resource.data.displayName.size() <= 40
          && request.resource.data.status in ['here', 'break', 'left']
          && request.resource.data.isGuest == true && request.resource.data.uid == null
          && pid.matches('^g_[A-Za-z0-9_-]{4,40}$');
        allow delete: if isOrganizer(sid);
      }

      // Games. The host creates them; organizers score, swap or cancel. A game
      // never goes back to 'playing' once it has ended (stops a stale host from
      // overwriting a scored game with a fresh one).
      match /matches/{mid} {
        allow read: if true;
        allow create: if isOrganizer(sid) && validMatch(request.resource.data)
          && request.resource.data.status == 'playing';
        allow update: if isOrganizer(sid) && validMatch(request.resource.data)
          && !(resource.data.status != 'playing' && request.resource.data.status == 'playing');
        allow delete: if isOrganizer(sid);
      }

      // The host-computed view everyone watches (TV, organizer screens).
      match /live/{doc} {
        allow read: if true;
        allow write: if isOrganizer(sid);
      }
    }

    function validMatch(d) {
      return d.keys().hasOnly(['courtId', 'team1', 'team2', 'names', 'startedAt', 'endedAt', 'score', 'submittedBy',
          'respondedBy', 'streaks', 'loggedSig', 'loggedRid', 'status', 'overriddenBy', 'clientAt'])
        && d.courtId is string && d.team1 is list && d.team2 is list
        && d.team1.size() <= 2 && d.team2.size() <= 2
        && d.status in ['playing', 'submitted', 'confirmed', 'disputed', 'overridden', 'cancelled']
        && isNum(d.startedAt) && optNum(d.get('endedAt', null))
        && (d.get('score', null) == null
            || (d.score is map && d.score.t1 is int && d.score.t2 is int
                && d.score.t1 >= 0 && d.score.t1 <= 99 && d.score.t2 >= 0 && d.score.t2 <= 99));
    }
  }
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npm run test:rules`
Expected: PASS — 46 tests, 0 failures.

Mutation check (proves the two key rules are actually tested; revert afterwards): temporarily change `allow list: if signedIn() && request.auth.uid in resource.data.organizerIds;` to `allow list: if true;` and delete the `&& !(resource.data.status != 'playing' && request.resource.data.status == 'playing')` clause → `npm run test:rules` must show **2 failures**. Restore the file (`git diff firestore.rules` shows only your intended change) and re-run: 46 pass.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules rules-tests/firestore-rules.spec.mjs
git commit -m "feat(rules): sessions, guest participants, matches and live state + emulator tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Session services — Firestore watchers/writes, host loop, form dialog

**Files:**
- Create: `lib/sessions.js`, `lib/host.js`, `lib/dialog.js`

**Interfaces:**
- Consumes: `db` (`lib/firebase.js`); Task 1 `newSessionDoc`, `cancelMatch`, `swapPlayer`, `enterScore`, `endSessionPatch`, `continueSessionPatch`; Task 2 `BEAT_MS`, `leaseState`, `claimHost`, `hostStep`; `html` (`lib/html.js`).
- Produces (UI tasks use exactly these):
  - `watchMySessions(uid, cb(list|undefined, err))` (items have `id`), `watchSession(sid, cb(session|null|undefined, err))`, `watchParticipants(sid, cb)` (items have `pid`), `watchMatches(sid, cb)` (items have `mid`), `watchLiveState(sid, cb(state|null))` — all return unsubscribe
  - `createSession(uid, value) → { sid, done: Promise }`, `updateSession(sid, fields)`, `endSession(sid)`, `continueSession(sid)`
  - `addGuests(sid, names, status)`, `setParticipantStatus(sid, pid, status)`, `setManyStatus(sid, pids, status)`
  - `scoreMatch(sid, match, uid, {t1,t2})`, `cancelGame(sid, match, fate)`, `swapInMatch(sid, match, outPid, inPid, inName, busyPids)` — Promises; invalid actions reject with `Error(code)`
  - `deleteSession(sid)` — async, awaited, needs a connection
  - `startHost({ sid, uid, onStatus(status), onError(err) }) → { feed({ session?, participants?, matches? }), stop() }`; status ∈ `'host' | 'waiting' | 'other' | 'stopped'`; `deviceId()`
  - `openDialog({ title, body, submitLabel, danger, validate(values) → errorMessage|null }) → Promise<values|null>`

No node tests (browser/Firebase modules); verified through the UI in Tasks 5–7. `npm test` must stay green (the html-usage guard reads these files).

- [ ] **Step 1: Create `lib/sessions.js`**

```js
// Sessions in Firestore (spec §4.2, §13): watchers + organizer writes.
// Browser only; shapes and rules of play live in lib/session-model.js.
// Floor actions are fire-and-forget (offline-tolerant): they apply to the
// local cache at once and sync later; callers .catch() to report a rejection.
import { db } from './firebase.js';
import {
  doc, collection, query, where, onSnapshot, setDoc, updateDoc, writeBatch, getDocs,
  serverTimestamp, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { newSessionDoc, cancelMatch, swapPlayer, enterScore, endSessionPatch, continueSessionPatch } from './session-model.js';

const sessionRef = (sid) => doc(db, 'sessions', sid);
const sub = (sid, name) => collection(db, 'sessions', sid, name);

// cb(list | undefined, error?) — snapshot helpers return unsubscribe.
function watchList(q, cb, idKey) {
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ [idKey]: d.id, ...d.data() }))), (err) => cb(undefined, err));
}

export function watchMySessions(uid, cb) {
  return watchList(query(collection(db, 'sessions'), where('organizerIds', 'array-contains', uid)), cb, 'id');
}

// cb(session | null, error?)
export function watchSession(sid, cb) {
  return onSnapshot(sessionRef(sid), (snap) => cb(snap.exists() ? { id: sid, ...snap.data() } : null), (err) => cb(undefined, err));
}
export const watchParticipants = (sid, cb) => watchList(sub(sid, 'participants'), cb, 'pid');
export const watchMatches = (sid, cb) => watchList(sub(sid, 'matches'), cb, 'mid');
export function watchLiveState(sid, cb) {
  return onSnapshot(doc(db, 'sessions', sid, 'live', 'state'), (snap) => cb(snap.exists() ? snap.data() : null), (err) => cb(undefined, err));
}

// Returns the new session id at once (the write syncs in the background).
export function createSession(uid, value) {
  const ref = doc(collection(db, 'sessions'));
  const done = setDoc(ref, { ...newSessionDoc(uid, value, Date.now()), createdAt: serverTimestamp() });
  return { sid: ref.id, done };
}

export function updateSession(sid, fields) {
  return updateDoc(sessionRef(sid), fields);
}
export const endSession = (sid) => updateSession(sid, endSessionPatch(Date.now()));
export const continueSession = (sid) => updateSession(sid, continueSessionPatch());

// Guest ids: g_ + 12 random url-safe characters.
function guestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return `g_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')}`;
}

// names: already parsed + de-duplicated. status: 'here' | 'break'.
export function addGuests(sid, names, status) {
  const now = Date.now();
  const batch = writeBatch(db);
  names.forEach((displayName, i) => {
    batch.set(doc(sub(sid, 'participants'), guestId()), {
      uid: null, isGuest: true, displayName, selfRating: null, status, checkedInAt: now + i, clientAt: now,
    });
  });
  return batch.commit();
}

export function setParticipantStatus(sid, pid, status) {
  return updateDoc(doc(sub(sid, 'participants'), pid), { status, clientAt: Date.now() });
}

// v1's "All here" / "All on hold".
export function setManyStatus(sid, pids, status) {
  const now = Date.now();
  const batch = writeBatch(db);
  pids.forEach((pid) => batch.update(doc(sub(sid, 'participants'), pid), { status, clientAt: now }));
  return batch.commit();
}

// Patches from session-model; { ok: false, error } is returned as a rejected promise.
const rejected = (r) => Promise.reject(new Error(r.error));

export function scoreMatch(sid, match, uid, score) {
  const r = enterScore(match, uid, score, Date.now());
  return r.ok ? updateDoc(doc(sub(sid, 'matches'), match.mid), r.patch) : rejected(r);
}

export function cancelGame(sid, match, fate) {
  const now = Date.now();
  const r = cancelMatch(match, fate, now);
  if (!r.ok) return rejected(r);
  const batch = writeBatch(db);
  batch.update(doc(sub(sid, 'matches'), match.mid), r.patch);
  r.hold.forEach((pid) => batch.update(doc(sub(sid, 'participants'), pid), { status: 'break', clientAt: now }));
  return batch.commit();
}

export function swapInMatch(sid, match, outPid, inPid, inName, busyPids) {
  const r = swapPlayer(match, outPid, inPid, inName, busyPids, Date.now());
  return r.ok ? updateDoc(doc(sub(sid, 'matches'), match.mid), r.patch) : rejected(r);
}

// Needs a connection: deletes every child doc (while the session still exists,
// so the organizer rule passes), then the session. Awaited by the caller.
export async function deleteSession(sid) {
  for (const name of ['participants', 'matches', 'live']) {
    const snap = await getDocs(sub(sid, name));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(sessionRef(sid));
}
```

- [ ] **Step 2: Create `lib/host.js`**

```js
// The host device (spec §5.6, §13.4). Any organizer device with a live session
// open runs startHost(): it claims the lease when it's free, renews it every
// BEAT_MS, and while it holds the lease runs the engine on every change and
// commits new matches + live/state. Browser only; decisions live in
// lib/host-lease.js and lib/host-step.js (both node-tested).
import { db } from './firebase.js';
import { doc, runTransaction, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { BEAT_MS, leaseState, claimHost } from './host-lease.js';
import { hostStep } from './host-step.js';

// One id per tab, so two tabs on one laptop never both host.
const DEVICE_ID = `d_${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
export const deviceId = () => DEVICE_ID;

// onStatus('host' | 'waiting' | 'other' | 'stopped', info) for the UI;
// onError(err) for engine/commit failures (shown as a toast).
// Call feed({ session, participants, matches }) on every snapshot; stop() on teardown.
export function startHost({ sid, uid, onStatus, onError }) {
  const sessionRef = doc(db, 'sessions', sid);
  let data = { session: null, participants: null, matches: null };
  let lastKey = null;
  let claiming = false;
  let stopped = false;
  let status = null;

  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s, data.session?.host ?? null); } };

  async function claim() {
    if (claiming) return;
    claiming = true;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sessionRef);
        const s = snap.data();
        if (!s || s.status !== 'live' || leaseState(s.host, DEVICE_ID, Date.now()) === 'taken') return;
        tx.update(sessionRef, { host: claimHost(s.host, DEVICE_ID, uid, Date.now()) });
      });
    } catch (err) {
      if (err?.code !== 'unavailable' && err?.code !== 'failed-precondition') onError?.(err);
    } finally {
      claiming = false;
    }
  }

  function run() {
    const { session, participants, matches } = data;
    if (stopped || !session || !participants || !matches) return;
    if (session.status !== 'live') { setStatus('stopped'); return; }
    const lease = leaseState(session.host, DEVICE_ID, Date.now());
    if (lease === 'free') { setStatus('waiting'); claim(); return; }
    if (lease === 'taken') { lastKey = null; setStatus('other'); return; }
    setStatus('host');
    try {
      const out = hostStep({ session, participants, matches, now: Date.now(), deviceId: DEVICE_ID, lastKey });
      if (!out.write) return;
      lastKey = out.stateKey;
      const batch = writeBatch(db);
      out.matches.forEach(({ mid, data: m }) => batch.set(doc(db, 'sessions', sid, 'matches', mid), m));
      batch.set(doc(db, 'sessions', sid, 'live', 'state'), out.state);
      batch.commit().catch((err) => { lastKey = null; onError?.(err); });
    } catch (err) {
      onError?.(err); // engine bug: keep the last good live/state
    }
  }

  // Renew the lease while we hold it; re-check a free lease on the same beat.
  const beat = setInterval(() => {
    const s = data.session;
    if (stopped || !s || s.status !== 'live') return;
    const lease = leaseState(s.host, DEVICE_ID, Date.now());
    if (lease === 'mine') updateDoc(sessionRef, { 'host.beatAt': Date.now() }).catch(() => {});
    else run();
  }, BEAT_MS);

  function release() {
    if (leaseState(data.session?.host, DEVICE_ID, Date.now()) === 'mine') updateDoc(sessionRef, { host: null }).catch(() => {});
  }
  window.addEventListener('pagehide', release);

  return {
    feed(patch) { data = { ...data, ...patch }; run(); },
    // Hand the lease back on the way out so another device can take over at once.
    stop() {
      stopped = true;
      clearInterval(beat);
      window.removeEventListener('pagehide', release);
      release();
    },
  };
}
```

- [ ] **Step 3: Create `lib/dialog.js`**

```js
// Form dialog styled like lib/confirm.js. body is an html`` fragment with the
// form's fields; the promise resolves to a plain object of the submitted
// fields (FormData), or null on cancel / Escape / backdrop click.
// validate(values) may return an error message to keep the dialog open.
import { html } from './html.js';

export function openDialog({ title, body, submitLabel = 'Save', danger = false, validate } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = html`
      <form class="modal__card modal__card--wide" role="dialog" aria-modal="true" aria-labelledby="dialog-title" novalidate>
        <h2 class="modal__title" id="dialog-title">${title}</h2>
        <div class="dialog__body">${body}</div>
        <p class="field__error dialog__error" aria-live="polite"></p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${submitLabel}</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    (form.querySelector('input, select, textarea') ?? form.querySelector('[type="submit"]')).focus();

    let done = false;
    function close(result) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      opener?.focus?.();
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') close(null); }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const error = validate?.(values);
      if (error) { form.querySelector('.dialog__error').textContent = error; return; }
      close(values);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="cancel"]') || e.target === overlay) close(null);
    });
    document.addEventListener('keydown', onKey);
  });
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npm test`
Expected: PASS, 0 failures (html-usage guard included).

- [ ] **Step 5: Commit**

```bash
git add lib/sessions.js lib/host.js lib/dialog.js
git commit -m "feat(sessions): Firestore session service, host lease loop, form dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: App shell, My Sessions, Create session, public TV view

**Files:**
- Modify: `lib/route-access.js`, `lib/router.js`, `lib/app.js` (full replacements below, minus the `s` route — added in Task 6), `features/home/home.js`, `features/home/home.css` (full replacements), `styles/base.css` (append), `index.html` (3 links)
- Create: `features/new-session/new-session.js`, `features/new-session/new-session.css`, `features/shared/rankings-table.js`, `features/tv/tv.js`, `features/tv/tv.css`
- Test: `tests/route-access.test.js`, `tests/router.test.js` (append)

**Interfaces:**
- Consumes: Task 1 (`groupSessions`, `localDate`, `validateSessionInput`, limits, `formatClock`, `formatElapsed`), Task 4 (`watchMySessions`, `deleteSession`, `createSession`, `watchSession`, `watchLiveState`, `watchMatches`), `appUrl`, `qrSvg`, `sessionStats`/`rankRows`.
- Produces: routes `new`, `tv/{sid}`; `PUBLIC_ROUTES = new Set(['tv'])`; `createRouter(..., { onRender(name, param) })`; `rankingsHtml(matches, sortKey, { limit })` + `SORTS` from `features/shared/rankings-table.js`; CSS classes `.choice`, `.check`, `.seg`, `.seg__btn`, `.seg--wide`, `.dialog__body`, `.dialog__choices`, `.dialog__error`, `.page--wide`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/route-access.test.js`:

```js
test('the TV view is public in every auth state, even while loading', () => {
  for (const status of ['loading', 'signedOut', 'needsProfile', 'ready']) {
    assert.deepEqual(resolveRoute(status, 'tv'), { show: 'tv' }, status);
  }
});
```

Append to `tests/router.test.js`:

```js
test('parseHash reads a route with an id', () => {
  assert.deepEqual(parseHash('#/tv/abc123'), { name: 'tv', param: 'abc123' });
});
```

Run: `npm test` → Expected: FAIL on "the TV view is public…" (`tv` isn't public yet). The router test passes already (it pins existing behaviour the TV route relies on).

- [ ] **Step 2: Shell changes**

Replace `lib/route-access.js`:

```js
// Which screen each auth state may see (spec §6). Pure — node-tested; the app
// shell (lib/app.js) applies the answer.
//
// status: 'loading' | 'signedOut' | 'needsProfile' | 'ready'
// Returns { show: routeName } to render, { redirect: routeName } to change
// the hash, or { wait: true } while auth is still loading. `remember: true`
// on a redirect means "come back to the requested route after signing in".

// Routes anyone may open without an account: the public TV / live view.
export const PUBLIC_ROUTES = new Set(['tv']);
const AUTH_ROUTES = new Set(['signin', 'setup']);

export function resolveRoute(status, name) {
  if (PUBLIC_ROUTES.has(name)) return { show: name };
  if (status === 'loading') return { wait: true };
  if (status === 'signedOut') {
    return name === 'signin' ? { show: 'signin' } : { redirect: 'signin', remember: !AUTH_ROUTES.has(name) };
  }
  if (status === 'needsProfile') {
    return name === 'setup' ? { show: 'setup' } : { redirect: 'setup', remember: !AUTH_ROUTES.has(name) };
  }
  if (status === 'ready') {
    return AUTH_ROUTES.has(name) ? { redirect: 'home', resume: true } : { show: name };
  }
  return { wait: true }; // unknown status: render nothing rather than fail open
}
```

Replace `lib/router.js`:

```js
// Hash router. parseHash is pure (node-tested); createRouter is browser-only.
export function parseHash(hash, fallback = 'home') {
  const clean = (hash || '').replace(/^#\/?/, '');
  if (!clean) return { name: fallback, param: null };
  const [name, param] = clean.split('/');
  return { name, param: param || null };
}

// Wires hashchange events to route handlers. Before each render it fires a
// `view:teardown` event on the container so the previous view can unsubscribe;
// after it, options.onRender(name, param) runs (titles, focus).
export function createRouter(routes, options = {}) {
  const guard = options.guard || (() => true);
  const fallback = options.fallback || 'home';
  const container = options.container;

  function render() {
    const { name, param } = parseHash(window.location.hash, fallback);
    if (!guard(name)) return;
    const handler = routes[name] || routes[fallback];
    container.dispatchEvent(new CustomEvent('view:teardown'));
    container.innerHTML = '';
    handler(container, param);
    options.onRender?.(routes[name] ? name : fallback, param);
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    // Remove the hashchange listener so a torn-down shell (e.g. after sign-out)
    // stops guarding navigation.
    stop() {
      window.removeEventListener('hashchange', render);
    },
    navigate(name, param) {
      window.location.hash = param ? `#/${name}/${param}` : `#/${name}`;
    },
  };
}
```

Replace `lib/app.js` with the version below **but without the session route for now**: delete the line `import { init as session } from '../features/session/session.js';` and the `s: session, ` entry in `routes` (Task 6 adds both back).

```js
// App entry: follows the Firebase sign-in + the player's profile, keeps
// lib/session.js current, and routes per lib/route-access.js.
import { createRouter, parseHash } from './router.js';
import { resolveRoute, PUBLIC_ROUTES } from './route-access.js';
import { getSession, setSession, onSession, statusForProfile } from './session.js';
import { html } from './html.js';
import { showToast } from './toast.js';
import { watchAuth, signOut } from './auth.js';
import { watchProfile } from './profiles.js';
import { mode } from './firebase.js';
import { envBadge } from './data-mode.js';
import { renderTopbar } from '../features/topbar/topbar.js';
import { init as signin } from '../features/signin/signin.js';
import { init as setup } from '../features/setup/setup.js';
import { init as home } from '../features/home/home.js';
import { init as me } from '../features/me/me.js';
import { init as profile } from '../features/profile/profile.js';
import { init as newSession } from '../features/new-session/new-session.js';
import { init as session } from '../features/session/session.js';
import { init as tv } from '../features/tv/tv.js';

const routes = { signin, setup, home, me, u: profile, new: newSession, s: session, tv };

// Default tab titles; a view may set a more specific one (e.g. the session name).
const TITLES = { signin: 'Sign in', setup: 'Set up your profile', home: 'My sessions', me: 'My profile', u: 'Player', new: 'New session', s: 'Session', tv: 'Live' };
const onPublicRoute = () => PUBLIC_ROUTES.has(parseHash(window.location.hash).name);

const view = document.getElementById('view');

// On localhost, a corner badge says whether this is LIVE data or the sandbox.
const badge = envBadge(window.location.hostname, mode);
if (badge) {
  const el = document.createElement('div');
  el.className = `env-badge env-badge--${badge.kind}`;
  el.textContent = badge.label;
  document.body.append(el);
}
const topbar = document.getElementById('topbar');
const RETURN_KEY = 'pd:returnTo';

// Remember where a signed-out visitor was heading (e.g. a player-card QR) so
// they land there after signing in. sessionStorage can be unavailable.
function remember(hash) {
  try { sessionStorage.setItem(RETURN_KEY, hash); } catch { /* ignore */ }
}
function takeRemembered() {
  try {
    const hash = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return hash;
  } catch { return null; }
}

// If the profile can't load (error, or offline on a new device) the app would
// sit on "Loading…" forever — offer a way out instead.
const STALL_MS = 10000;
let stallTimer = null;
function showStalled(message) {
  if (onPublicRoute()) return; // the TV view doesn't need a profile
  document.getElementById('boot')?.remove();
  view.dispatchEvent(new CustomEvent('view:teardown'));
  view.innerHTML = html`
    <section class="page stalled">
      <h1 class="page__title">Can't reach Paddle District</h1>
      <p class="page__sub">${message}</p>
      <div class="stalled__actions">
        <button type="button" class="btn btn--primary" data-act="retry">Try again</button>
        <button type="button" class="btn btn--ghost" data-act="signout">Sign out</button>
      </div>
    </section>`;
  view.querySelector('[data-act="retry"]').addEventListener('click', () => window.location.reload());
  view.querySelector('[data-act="signout"]').addEventListener('click', () => { signOut().catch(() => {}); });
}
function armStallTimer() {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => showStalled('Still loading — check your connection and try again.'), STALL_MS);
}
armStallTimer(); // the session starts in 'loading'

function guard(name) {
  const r = resolveRoute(getSession().status, name);
  if (r.wait) return false;
  if (r.redirect) {
    if (r.remember) remember(window.location.hash);
    const target = (r.resume && takeRemembered()) || `#/${r.redirect}`;
    window.location.replace(target); // same-page hash change → router renders again
    return false;
  }
  document.getElementById('boot')?.remove(); // public routes render before auth resolves
  window.scrollTo(0, 0); // each screen starts at the top
  return true;
}

// Title + focus on every route change, so screen readers hear the new screen.
function onRender(name) {
  document.title = `${TITLES[name] ?? 'Paddle District'} · Paddle District`;
  const h1 = view.querySelector('h1');
  if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
}

// The router is rebuilt whenever the auth status changes so the guard re-runs
// for the current hash (AGENTS.md: stop() the old one first).
let router = null;
function restartRouter() {
  router?.stop();
  router = createRouter(routes, { container: view, fallback: 'home', guard, onRender });
  router.start();
}

let lastStatus = null;
onSession((s) => {
  renderTopbar(topbar, s);
  if (s.status === lastStatus) return;
  lastStatus = s.status;
  if (s.status === 'loading') armStallTimer(); else clearTimeout(stallTimer);
  if (s.status !== 'loading') document.getElementById('boot')?.remove();
  // Public views (TV) don't depend on auth: keep them running instead of
  // re-rendering on every auth change. Their guard still reads the live status.
  if (router && onPublicRoute()) return;
  restartRouter();
});

let unsubProfile = null;
watchAuth((user) => {
  unsubProfile?.();
  unsubProfile = null;
  if (!user) {
    const signedOut = getSession().user !== null; // an explicit sign-out, not a first visit
    setSession({ status: 'signedOut', user: null, profile: null });
    if (signedOut) takeRemembered(); // don't send the next person to this one's page
    return;
  }
  setSession({ status: 'loading', user, profile: null });
  unsubProfile = watchProfile(user.uid, (p, err, meta) => {
    if (err) {
      if (getSession().status === 'loading') { clearTimeout(stallTimer); showStalled(`Could not load your profile: ${err.message}`); }
      else showToast(`Lost connection to your profile: ${err.message}`, 'error');
      return;
    }
    const status = statusForProfile(getSession().status, p, meta.pending, meta.fromCache);
    if (status) setSession({ profile: p, status });
  });
});
```

Run: `npm test` → Expected: PASS.

- [ ] **Step 3: Shared styles and stylesheet links**

Append to `styles/base.css`:

```css
/* Choice rows (radio cards), checkboxes and segmented buttons — shared by forms and dialogs */
.choice { display: flex; align-items: flex-start; gap: var(--space-2); padding: 10px 12px; min-height: var(--tap); border: 1.5px solid var(--color-border); border-radius: var(--radius); cursor: pointer; background: var(--color-input); }
.choice:has(input:checked) { border-color: var(--color-primary); background: var(--color-tint); }
.choice input { margin-top: 4px; accent-color: var(--color-primary); }
.choice > span { display: flex; flex-direction: column; }
.choice__hint { color: var(--color-muted); font-size: 0.85rem; font-weight: 500; }
.check { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--tap); font-weight: 600; cursor: pointer; }
.check input { width: 20px; height: 20px; accent-color: var(--color-primary); }
.seg { display: inline-flex; border: 1.5px solid var(--color-border); border-radius: var(--radius-full); overflow: hidden; background: var(--color-input); flex: none; }
.seg__btn { font: inherit; font-size: 0.8rem; font-weight: 700; min-height: var(--tap); padding: 0 12px; border: 0; background: transparent; color: var(--color-muted); cursor: pointer; }
.seg__btn + .seg__btn { border-left: 1px solid var(--color-border); }
.seg__btn[aria-pressed="true"] { background: var(--color-primary); color: var(--color-on-dark); }
.seg__btn:focus-visible { outline: 3px solid var(--color-focus); outline-offset: -3px; }
.seg__btn:disabled { cursor: default; opacity: 0.7; }
.seg--wide { display: flex; margin-bottom: var(--space-3); }
.seg--wide .seg__btn { flex: 1; }
.dialog__body { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-2); }
.dialog__choices { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.dialog__error { margin-bottom: var(--space-2); }
.page--wide { max-width: 960px; }
```

In `index.html`, after `<link rel="stylesheet" href="/features/profile/profile.css" />`, add:

```html
  <link rel="stylesheet" href="/features/new-session/new-session.css" />
  <link rel="stylesheet" href="/features/session/session.css" />
  <link rel="stylesheet" href="/features/tv/tv.css" />
```

(`session.css` is created in Task 6; the 404 until then is harmless.)

- [ ] **Step 4: My Sessions**

Replace `features/home/home.js`:

```js
// My Sessions (#/home, spec §13.1): sessions I organize — live → upcoming →
// past — plus Create session and delete (owner only).
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { showToast } from '../../lib/toast.js';
import { showConfirm } from '../../lib/confirm.js';
import { watchMySessions, deleteSession } from '../../lib/sessions.js';
import { groupSessions, localDate } from '../../lib/session-model.js';

const RULE_LABELS = { everyoneOff: 'Everyone off', winnersStay: 'Winners stay', winnersSplit: 'Winners split' };

function prettyDate(date) {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function rowHtml(s, uid) {
  return html`
    <li class="session-row">
      <a class="session-row__main" href="#/s/${s.id}">
        <span class="session-row__name">${s.name}</span>
        <span class="session-row__meta">${prettyDate(s.date)}${s.venue ? html` · ${s.venue}` : ''} · ${s.courts?.length ?? 0} courts · ${RULE_LABELS[s.courtRule?.type] ?? ''}</span>
      </a>
      ${s.ownerId === uid ? html`<button type="button" class="btn btn--ghost btn--sm" data-delete="${s.id}" aria-label="Delete ${s.name}">Delete</button>` : ''}
    </li>`;
}

function groupHtml(title, list, uid, extraClass = '') {
  if (!list.length) return '';
  return html`
    <section class="home__group ${extraClass}">
      <h2 class="eyebrow">${title}</h2>
      <ul class="session-list">${list.map((s) => rowHtml(s, uid))}</ul>
    </section>`;
}

export function init(container) {
  const { profile, user } = getSession();
  container.innerHTML = html`
    <section class="page home">
      <div class="home__head">
        <div class="home__hello">
          <p class="eyebrow">Hi, ${profile.displayName}</p>
          <h1 class="page__title">My sessions</h1>
        </div>
        <a class="btn btn--primary" href="#/new">+ New session</a>
      </div>
      <div data-list><p class="page__sub">Loading your sessions…</p></div>
      <a class="btn btn--secondary btn--block" href="#/me">Show my player card</a>
    </section>`;

  const listEl = container.querySelector('[data-list]');
  let sessions = [];
  const unsub = watchMySessions(user.uid, (list, err) => {
    if (err) { listEl.innerHTML = html`<p class="field__error">Couldn't load your sessions: ${err.message}</p>`; return; }
    sessions = list;
    if (!list.length) {
      listEl.innerHTML = html`
        <div class="card home__empty">
          <span class="home__empty-icon" aria-hidden="true">🏓</span>
          <h2 class="card__title">No sessions yet</h2>
          <p class="page__sub">Create one for tonight's open play — paste your player list and the courts fill themselves.</p>
          <a class="btn btn--accent" href="#/new">Create your first session</a>
        </div>`;
      return;
    }
    const g = groupSessions(list, localDate(new Date()));
    listEl.innerHTML = html`
      ${groupHtml('Live now', g.live, user.uid, 'home__group--live')}
      ${groupHtml('Upcoming', g.upcoming, user.uid)}
      ${groupHtml('Past', g.past, user.uid)}`;
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    const s = sessions.find((x) => x.id === btn.dataset.delete);
    const ok = await showConfirm({
      title: `Delete “${s?.name ?? 'session'}”?`,
      message: 'This removes its players, games and rankings for good. Export it first if you want to keep a copy.',
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
      await deleteSession(btn.dataset.delete);
      showToast('Session deleted.', 'success');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Delete';
      showToast(`Couldn't delete — check your connection. (${err.message})`, 'error');
    }
  });

  container.addEventListener('view:teardown', unsub, { once: true });
}
```

Replace `features/home/home.css`:

```css
.home__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.home__hello { display: flex; flex-direction: column; gap: 2px; }
.home__group { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.home__group--live .session-row { border-left: 5px solid var(--color-accent); }
.home__empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); border-left: 5px solid var(--color-highlight); }
.home__empty-icon { font-size: 1.6rem; }

.session-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.session-row { display: flex; align-items: center; gap: var(--space-2); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); box-shadow: var(--shadow-sm); }
.session-row__main { flex: 1; min-width: 0; min-height: var(--tap); display: flex; flex-direction: column; justify-content: center; text-decoration: none; color: inherit; }
.session-row__main:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; border-radius: var(--radius); }
.session-row__name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-row__meta { color: var(--color-muted); font-size: 0.82rem; }
```

- [ ] **Step 5: Create session**

Create `features/new-session/new-session.js`:

```js
// Create session (#/new, spec §13.1). Mode is fairness in 3a; stacking comes in 3c.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { showToast } from '../../lib/toast.js';
import { createSession } from '../../lib/sessions.js';
import { validateSessionInput, localDate, MAX_COURTS, SESSION_NAME_MAX, VENUE_MAX } from '../../lib/session-model.js';

const RULES = [
  ['everyoneOff', 'Everyone off', 'All four leave after each game.'],
  ['winnersStay', 'Winners stay', 'Winners keep the court and face the next two.'],
  ['winnersSplit', 'Winners split', 'Winners stay but each partners a newcomer.'],
];

export function init(container) {
  const { user } = getSession();
  container.innerHTML = html`
    <section class="page new-session">
      <a class="new-session__back" href="#/home">← My sessions</a>
      <h1 class="page__title">New session</h1>
      <form class="card new-session__form" novalidate>
        <label class="field">
          <span class="field__label">Session name</span>
          <input class="input" name="name" maxlength="${SESSION_NAME_MAX}" placeholder="Saturday open play" autocomplete="off">
          <span class="field__error" data-error="name" aria-live="polite"></span>
        </label>
        <div class="new-session__row">
          <label class="field">
            <span class="field__label">Date</span>
            <input class="input" type="date" name="date" value="${localDate(new Date())}">
            <span class="field__error" data-error="date" aria-live="polite"></span>
          </label>
          <label class="field">
            <span class="field__label">Courts</span>
            <input class="input" type="number" name="courts" min="1" max="${MAX_COURTS}" step="1" value="2" inputmode="numeric">
            <span class="field__error" data-error="courts" aria-live="polite"></span>
          </label>
        </div>
        <label class="field">
          <span class="field__label">Venue (optional)</span>
          <input class="input" name="venue" maxlength="${VENUE_MAX}" placeholder="e.g. Elm Park courts">
          <span class="field__error" data-error="venue" aria-live="polite"></span>
        </label>
        <fieldset class="field new-session__rules">
          <legend class="field__label">Court rule</legend>
          ${RULES.map(([value, label, hint], i) => html`
            <label class="choice">
              <input type="radio" name="ruleType" value="${value}" ${i === 0 ? 'checked' : ''}>
              <span><strong>${label}</strong><span class="choice__hint">${hint}</span></span>
            </label>`)}
          <span class="field__error" data-error="ruleType" aria-live="polite"></span>
        </fieldset>
        <label class="field" data-maxwins hidden>
          <span class="field__label">Max wins in a row</span>
          <input class="input" type="number" name="maxWins" min="1" max="5" step="1" value="2" inputmode="numeric">
          <span class="field__error" data-error="maxWins" aria-live="polite"></span>
        </label>
        <button class="btn btn--primary btn--block" type="submit">Create session</button>
      </form>
    </section>`;

  const form = container.querySelector('form');
  const maxWins = form.querySelector('[data-maxwins]');
  form.addEventListener('change', () => {
    maxWins.hidden = form.elements.ruleType.value === 'everyoneOff';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { ok, value, errors } = validateSessionInput(Object.fromEntries(new FormData(form)));
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = errors[el.dataset.error] ?? '';
      el.closest('.field')?.querySelector('.input')?.setAttribute('aria-invalid', String(!!errors[el.dataset.error]));
    });
    if (!ok) {
      form.querySelector('[aria-invalid="true"], [data-error]:not(:empty)')?.closest('.field')?.querySelector('input')?.focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creating…';
    const { sid, done } = createSession(user.uid, value); // offline-tolerant: syncs later
    done.catch((err) => showToast(`Couldn't save the session: ${err.message}`, 'error'));
    window.location.hash = `#/s/${sid}`;
  });
}
```

Create `features/new-session/new-session.css`:

```css
.new-session__back { font-weight: 700; text-decoration: none; min-height: var(--tap); display: inline-flex; align-items: center; align-self: flex-start; }
.new-session__form { display: flex; flex-direction: column; gap: var(--space-3); }
.new-session__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.new-session__rules { border: 0; padding: 0; margin: 0; }
.new-session__rules legend { margin-bottom: 6px; }

@media (max-width: 360px) { .new-session__row { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Rankings table + TV view**

Create `features/shared/rankings-table.js`:

```js
// Session leaderboard table (spec §6): Wins / Points / Win% / Pt%, ties broken
// by score diff. Shared by the organizer Rankings tab and the TV view.
import { html } from '../../lib/html.js';
import { sessionStats, rankRows } from '../../lib/session-stats.js';

export const SORTS = [['wins', 'Wins'], ['points', 'Points'], ['winpct', 'Win %'], ['ptpct', 'Pt %']];

export function rankingsHtml(matches, sortKey = 'wins', { limit } = {}) {
  const rows = rankRows(sessionStats(matches), sortKey).slice(0, limit ?? Infinity);
  if (!rows.length) return html`<p class="page__sub">Rankings appear after the first score.</p>`;
  return html`
    <table class="rankings">
      <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">GP</th><th scope="col">W</th><th scope="col">L</th><th scope="col">Pts</th><th scope="col">+/-</th><th scope="col">Win%</th><th scope="col">Pt%</th></tr></thead>
      <tbody>${rows.map((r, i) => html`
        <tr>
          <td class="num">${i + 1}</td><th scope="row">${r.name}</th>
          <td class="num">${r.gp}</td><td class="num">${r.wins}</td><td class="num">${r.losses}</td>
          <td class="num">${r.points}</td><td class="num">${r.diff > 0 ? `+${r.diff}` : r.diff}</td>
          <td class="num">${r.winPct}%</td><td class="num">${r.ptPct}%</td>
        </tr>`)}</tbody>
    </table>`;
}
```

Create `features/tv/tv.js`:

```js
// Public live view (#/tv/{sid}, spec §13.1) — v1's live view and a TV display.
// No sign-in: reads only public data (session, live/state, matches). Always
// dark; the topbar is hidden while it's open.
import { html, raw } from '../../lib/html.js';
import { formatClock, formatElapsed } from '../../lib/time-format.js';
import { appUrl } from '../../lib/app-url.js';
import { watchSession, watchLiveState, watchMatches } from '../../lib/sessions.js';
import { rankingsHtml } from '../shared/rankings-table.js';

const teamText = (names, pids) => pids.map((p) => names?.[p] ?? '?').join(' & ');

function courtsHtml(live, session) {
  const courts = live?.courts ?? session.courts.map((c) => ({ courtId: c.id, name: c.name, paused: c.paused, team1: [], team2: [] }));
  return html`${courts.map((c) => html`
    <article class="tv-court ${c.matchId ? 'tv-court--playing' : ''}">
      <header class="tv-court__head"><h2>${c.name}</h2>${c.matchId && c.startedAt ? html`<span class="num" data-since="${c.startedAt}">${formatClock(Date.now() - c.startedAt)}</span>` : ''}</header>
      ${c.matchId
        ? html`<p class="tv-court__team tv-court__team--1">${teamText(live.names, c.team1)}</p><p class="tv-court__vs">vs</p><p class="tv-court__team tv-court__team--2">${teamText(live.names, c.team2)}</p>`
        : html`<p class="tv-court__empty">${c.paused ? 'Paused' : 'Waiting for players'}</p>`}
    </article>`)}`;
}

export function init(container, sid) {
  document.body.classList.add('tv-mode');
  const prevTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'dark';
  container.innerHTML = html`<section class="tv"><p class="tv__loading">Loading live view…</p></section>`;
  const root = container.querySelector('.tv');
  const data = { session: undefined, live: null, matches: [] };
  let drawn = false;
  let qrUrl = null;

  function draw() {
    const s = data.session;
    if (s === null) { root.innerHTML = html`<h1 class="tv__title">Session not found</h1><p class="tv__sub">Check the link with your organizer.</p>`; drawn = false; return; }
    if (!s) return;
    if (!drawn) {
      root.innerHTML = html`
        <header class="tv__head">
          <img class="tv__logo" src="/assets/logo-96.png" alt="" width="56" height="56">
          <div class="tv__heading"><h1 class="tv__title" data-name></h1><p class="tv__sub" data-meta></p></div>
          <span class="tv__clock num" data-clock></span>
        </header>
        <div class="tv__grid">
          <section class="tv__courts" data-courts aria-label="Courts"></section>
          <aside class="tv__side">
            <section class="tv-card"><h2>Up next</h2><ol class="tv-next" data-next></ol></section>
            <section class="tv-card"><h2>Rankings</h2><div data-rank></div></section>
            <section class="tv-card tv-card--qr" data-qr-card hidden><h2>Follow on your phone</h2><div class="tv__qr" data-qr></div></section>
          </aside>
        </div>`;
      drawn = true;
    }
    root.querySelector('[data-name]').textContent = s.name;
    root.querySelector('[data-meta]').textContent = [s.venue, s.status === 'ended' ? 'Session ended' : null].filter(Boolean).join(' · ');
    document.title = `${s.name} · Live · Paddle District`;
    root.querySelector('[data-courts]').innerHTML = courtsHtml(data.live, s);
    const next = (data.live?.queue ?? []).slice(0, 8).flatMap((q) => q.pids);
    root.querySelector('[data-next]').innerHTML = next.length
      ? html`${next.map((pid, i) => html`<li class="${i < 4 ? 'tv-next--soon' : ''}">${data.live.names?.[pid] ?? '?'}</li>`)}`
      : html`<li class="tv__sub">Nobody waiting</li>`;
    root.querySelector('[data-rank]').innerHTML = rankingsHtml(data.matches, 'wins', { limit: 10 });
    const qrCard = root.querySelector('[data-qr-card]');
    qrCard.hidden = !s.shareQr;
    const url = appUrl(window.location, `#/tv/${sid}`);
    if (s.shareQr && qrUrl !== url) {
      qrUrl = url;
      import('../../lib/qr.js').then(({ qrSvg }) => { root.querySelector('[data-qr]').innerHTML = html`${raw(qrSvg(url))}`; }).catch(() => { qrUrl = null; });
    }
  }

  const unsubs = [
    watchSession(sid, (s, err) => { if (!err) { data.session = s; draw(); } }),
    watchLiveState(sid, (st, err) => { if (!err) { data.live = st; draw(); } }),
    watchMatches(sid, (list, err) => { if (!err) { data.matches = list; draw(); } }),
  ];
  const tick = setInterval(() => {
    const s = data.session;
    const clock = root.querySelector('[data-clock]');
    if (clock && s?.startedAt) clock.textContent = formatElapsed((s.endedAt ?? Date.now()) - s.startedAt);
    root.querySelectorAll('[data-since]').forEach((el) => { el.textContent = formatClock(Date.now() - Number(el.dataset.since)); });
  }, 1000);

  container.addEventListener('view:teardown', () => {
    unsubs.forEach((u) => u());
    clearInterval(tick);
    document.body.classList.remove('tv-mode');
    document.documentElement.dataset.theme = prevTheme;
  }, { once: true });
}
```

Create `features/tv/tv.css`:

```css
/* Public live view / TV (#/tv/{sid}) — always dark, big type */
body.tv-mode #topbar, body.tv-mode .env-badge { display: none; }
.tv { min-height: 100vh; padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
.tv__loading, .tv__sub { color: var(--color-muted); }
.tv__head { display: flex; align-items: center; gap: var(--space-3); }
.tv__logo { width: 56px; height: 56px; border-radius: 16px; background: var(--color-logo-bg); padding: 4px; }
.tv__heading { flex: 1; min-width: 0; }
.tv__title { font-size: clamp(1.4rem, 3vw, 2.4rem); }
.tv__clock { font-size: clamp(1.4rem, 3vw, 2.4rem); font-weight: 800; }
.tv__grid { display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-4); align-items: start; }
.tv__courts { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-3); }
.tv-court { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-3); display: flex; flex-direction: column; gap: 6px; }
.tv-court--playing { border-top: 6px solid var(--color-accent); }
.tv-court__head { display: flex; justify-content: space-between; align-items: center; font-size: 1.2rem; font-weight: 800; }
.tv-court__head h2 { font-size: 1.3rem; }
.tv-court__team { font-size: clamp(1.1rem, 2vw, 1.6rem); font-weight: 800; padding: 8px 12px; border-radius: var(--radius); }
.tv-court__team--1 { background: var(--color-primary); color: var(--color-on-dark); }
.tv-court__team--2 { background: var(--color-highlight); color: var(--color-highlight-ink); }
.tv-court__vs { text-align: center; font-weight: 800; color: var(--color-muted); font-size: 0.8rem; text-transform: uppercase; }
.tv-court__empty { color: var(--color-muted); font-size: 1.2rem; font-weight: 700; padding: var(--space-3) 0; }
.tv__side { display: flex; flex-direction: column; gap: var(--space-3); }
.tv-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-3); }
.tv-card h2 { font-size: 1.1rem; margin-bottom: var(--space-2); }
.tv-next { margin: 0; padding-left: 1.5em; font-size: 1.15rem; font-weight: 700; }
.tv-next--soon::marker { color: var(--color-highlight); }
.tv-card--qr { text-align: center; }
.tv__qr { width: 220px; max-width: 100%; margin: 0 auto; background: var(--color-qr-bg); padding: 10px; border-radius: var(--radius); }
.tv__qr svg { display: block; width: 100%; height: auto; }
@media (max-width: 800px) { .tv { padding: var(--space-3); } .tv__grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: Verify**

Run: `npm test` → PASS.
Browser (`npm run emulators` + `npm run serve`, open `http://localhost:5174/?emulators`): sign in (emulator popup → Add new account), set up a handle → **My sessions** shows the empty state with "Create your first session"; **+ New session** validates (empty name → inline error, focus moves to it); creating navigates to `#/s/{id}` (the session view arrives in Task 6 — until then it falls back to home, which now lists the session under **Live now**). Open `#/tv/{id}` in a private window: dark live view with the session name, courts "Waiting for players", no topbar, no "Loading…" block.

- [ ] **Step 8: Commit**

```bash
git add lib/route-access.js lib/router.js lib/app.js tests/route-access.test.js tests/router.test.js styles/base.css index.html features/home features/new-session features/shared/rankings-table.js features/tv
git commit -m "feat(sessions): My Sessions, create session, public TV view; tv route, titles + focus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Organizer session view (`#/s/{sid}`)

**Files:**
- Create: `features/session/session.js`, `features/session/floor.js`, `features/session/courts.js`, `features/session/players.js`, `features/session/scores.js`, `features/session/rankings.js`, `features/session/settings.js`, `features/session/session.css`
- Modify: `lib/app.js` (add the session route back)

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 4, 5. Tab modules export `mount(panel, ctx) → { update(ctx) }`; `ctx = { sid, uid, session, participants, matches, live, sync }` (one shared, mutated object).
- Produces: route `s/{sid}` — organizer view with tabs Courts · Players · Scores · Rankings · Settings, host banner, session clock, sync dot.

- [ ] **Step 1: Register the route**

In `lib/app.js` add, after the `newSession` import:

```js
import { init as session } from '../features/session/session.js';
```

and make the routes line:

```js
const routes = { signin, setup, home, me, u: profile, new: newSession, s: session, tv };
```

- [ ] **Step 2: Shell + shared floor helpers**

Create `features/session/session.js`:

```js
// Organizer session view (#/s/{sid}, spec §13.1). Watches the session, its
// players, games and live state; runs the host on this device; renders one
// tab at a time. Tabs live in sibling modules and export
// mount(panel, ctx) → { update(ctx) }.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { showToast } from '../../lib/toast.js';
import { formatElapsed, formatClock } from '../../lib/time-format.js';
import { createSyncStatus } from '../../lib/sync-status.js';
import { appUrl } from '../../lib/app-url.js';
import { watchSession, watchParticipants, watchMatches, watchLiveState, continueSession } from '../../lib/sessions.js';
import { startHost } from '../../lib/host.js';
import * as courtsTab from './courts.js';
import * as playersTab from './players.js';
import * as scoresTab from './scores.js';
import * as rankingsTab from './rankings.js';
import * as settingsTab from './settings.js';

const TABS = [
  ['courts', 'Courts', courtsTab],
  ['players', 'Players', playersTab],
  ['scores', 'Scores', scoresTab],
  ['rankings', 'Rankings', rankingsTab],
  ['settings', 'Settings', settingsTab],
];
const HOST_TEXT = {
  host: 'This device is running the queue',
  waiting: 'Starting the queue…',
  other: 'Queue run by your other device',
  stopped: 'Session ended — queue stopped',
};
const SYNC_TEXT = { saved: 'Saved', syncing: 'Syncing…', offline: 'Offline — changes will sync' };

export function init(container, sid) {
  const { user } = getSession();
  container.innerHTML = html`<section class="page page--wide session"><p class="page__sub">Loading session…</p></section>`;
  const root = container.querySelector('.session');
  const ctx = { sid, uid: user.uid, session: undefined, participants: null, matches: null, live: null, sync: null };
  const unsubs = [];
  let host = null;
  let tabs = null; // { id → { panel, view } } once the shell is drawn
  let active = 'courts';

  const sync = createSyncStatus((s) => {
    const el = root.querySelector('[data-sync]');
    if (el) { el.dataset.state = s; el.textContent = SYNC_TEXT[s]; }
  }, { online: navigator.onLine });
  ctx.sync = sync;
  const onOnline = () => sync.setOnline(navigator.onLine);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOnline);

  function drawShell() {
    root.innerHTML = html`
      <header class="session__head">
        <div class="session__title">
          <p class="eyebrow" data-meta></p>
          <h1 class="page__title" data-name></h1>
        </div>
        <div class="session__status">
          <span class="session__clock num" data-clock>00:00:00</span>
          <span class="sync-dot" data-sync data-state="${sync.state()}">${SYNC_TEXT[sync.state()]}</span>
        </div>
      </header>
      <div class="session__banner" data-banner hidden></div>
      <nav class="tabs" role="tablist" aria-label="Session sections">
        ${TABS.map(([id, label]) => html`<button type="button" role="tab" class="tabs__tab" id="tab-${id}" data-tab="${id}" aria-controls="panel-${id}" aria-selected="${id === active}">${label}</button>`)}
      </nav>
      ${TABS.map(([id]) => html`<div class="tabs__panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${id === active ? '' : 'hidden'}></div>`)}`;
    tabs = Object.fromEntries(TABS.map(([id, , mod]) => [id, { panel: root.querySelector(`#panel-${id}`), mod, view: null }]));
    root.querySelector('.tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) select(btn.dataset.tab);
    });
    root.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.findIndex(([id]) => id === active);
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
      select(next);
      root.querySelector(`#tab-${next}`).focus();
    });
  }

  function select(id) {
    active = id;
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    Object.entries(tabs).forEach(([tid, t]) => { t.panel.hidden = tid !== id; });
    render();
  }

  function renderHead() {
    const s = ctx.session;
    root.querySelector('[data-name]').textContent = s.name;
    root.querySelector('[data-meta]').textContent = [s.date, s.venue, s.status === 'ended' ? 'Ended' : 'Live'].filter(Boolean).join(' · ');
    document.title = `${s.name} · Paddle District`;
  }

  function renderBanner(hostStatus) {
    const el = root.querySelector('[data-banner]');
    const s = ctx.session;
    if (s.status === 'ended') {
      el.hidden = false;
      el.className = 'session__banner session__banner--ended';
      el.innerHTML = html`<span>Session ended. Scores can still be fixed.</span><button type="button" class="btn btn--sm btn--accent" data-continue>Continue session</button>`;
      return;
    }
    el.hidden = false;
    el.className = `session__banner session__banner--${hostStatus ?? 'waiting'}`;
    el.textContent = HOST_TEXT[hostStatus ?? 'waiting'];
  }

  function render() {
    if (!tabs || !ctx.session || !ctx.participants || !ctx.matches) return;
    renderHead();
    const t = tabs[active];
    if (!t.view) t.view = t.mod.mount(t.panel, ctx);
    t.view.update(ctx);
  }

  let hostStatus = null;
  function onData(patch) {
    Object.assign(ctx, patch);
    if (ctx.session === null) {
      root.innerHTML = html`
        <h1 class="page__title">Session not found</h1>
        <p class="page__sub">It may have been deleted, or the link is incomplete.</p>
        <a class="btn btn--primary" href="#/home">Back to my sessions</a>`;
      return;
    }
    if (!ctx.session) return;
    if (!ctx.session.organizerIds?.includes(user.uid)) { showNotOrganizer(); return; }
    if (!tabs) { drawShell(); startHosting(); }
    host?.feed({ session: ctx.session, participants: ctx.participants, matches: ctx.matches });
    renderBanner(hostStatus);
    render();
  }

  function showNotOrganizer() {
    stopAll();
    root.innerHTML = html`
      <p class="eyebrow">${ctx.session.name}</p>
      <h1 class="page__title">Only organizers can run this session</h1>
      <p class="page__sub">You can still follow the courts, queue and rankings live.</p>
      <a class="btn btn--primary" href="${appUrl(window.location, `#/tv/${sid}`)}">Open the live view</a>`;
  }

  function startHosting() {
    host = startHost({
      sid,
      uid: user.uid,
      onStatus: (s) => { hostStatus = s; if (ctx.session) renderBanner(s); },
      onError: (err) => showToast(`Queue problem: ${err.message}`, 'error'),
    });
  }

  const fail = (what) => (err) => showToast(`Couldn't load ${what}: ${err.message}`, 'error');
  unsubs.push(watchSession(sid, (s, err) => (err ? fail('the session')(err) : onData({ session: s }))));
  unsubs.push(watchParticipants(sid, (list, err) => (err ? fail('players')(err) : onData({ participants: list }))));
  unsubs.push(watchMatches(sid, (list, err) => (err ? fail('games')(err) : onData({ matches: list }))));
  unsubs.push(watchLiveState(sid, (state, err) => (err ? fail('the queue')(err) : onData({ live: state }))));

  // Continue (banner button) — delegated so the banner can re-render freely.
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-continue]')) return;
    sync.track(continueSession(sid)).catch((err) => showToast(`Couldn't continue: ${err.message}`, 'error'));
  });

  // One ticker for the session clock and every court timer.
  const tick = setInterval(() => {
    const s = ctx.session;
    const clock = root.querySelector('[data-clock]');
    if (clock && s?.startedAt) clock.textContent = formatElapsed((s.endedAt ?? Date.now()) - s.startedAt);
    root.querySelectorAll('[data-since]').forEach((el) => { el.textContent = formatClock(Date.now() - Number(el.dataset.since)); });
  }, 1000);

  function stopAll() {
    unsubs.splice(0).forEach((u) => u());
    host?.stop();
    host = null;
  }
  container.addEventListener('view:teardown', () => {
    stopAll();
    clearInterval(tick);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOnline);
  }, { once: true });
}
```

Create `features/session/floor.js`:

```js
// Shared helpers for the session tabs: who is where, and the score / swap /
// cancel dialogs. Writes go through lib/sessions.js and ctx.sync.track().
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { openDialog } from '../../lib/dialog.js';
import { validateScore } from '../../lib/score-flow.js';
import { scoreMatch, swapInMatch, cancelGame } from '../../lib/sessions.js';

export const playingMatches = (matches) => matches.filter((m) => m.status === 'playing');
export const busyPids = (matches) => new Set(playingMatches(matches).flatMap((m) => [...m.team1, ...m.team2]));
export const nameIn = (ctx, pid) => ctx.participants.find((p) => p.pid === pid)?.displayName ?? '?';
export const matchName = (m, pid) => m.names?.[pid] ?? '?';
export const isEnded = (ctx) => ctx.session.status === 'ended';

const WARN = { 'zero-zero': '0–0 is unusual.', tie: 'A tie means nobody wins.', 'win-by-one': 'Winning by 1 is unusual.' };
const report = (what) => (err) => showToast(`Couldn't ${what}: ${err.message}`, 'error');

export function teamHtml(m, team) {
  return html`<span class="team team--${team === 'team1' ? 1 : 2}">${m[team].map((pid, i) => html`${i ? html`<span class="team__amp"> &amp; </span>` : ''}<span>${matchName(m, pid)}</span>`)}</span>`;
}

// Enter or edit a score. Unusual scores warn once; Save again to confirm.
export async function scoreDialog(ctx, match) {
  let warned = null;
  const values = await openDialog({
    title: match.score ? 'Edit score' : 'Enter score',
    submitLabel: 'Save score',
    body: html`
      <div class="score-form">
        <label class="field score-form__team">
          <span class="field__label">${match.team1.map((p) => matchName(match, p)).join(' & ')}</span>
          <input class="input score-form__input num" name="t1" type="number" min="0" max="99" step="1" inputmode="numeric" value="${match.score?.t1 ?? ''}" required>
        </label>
        <span class="score-form__vs" aria-hidden="true">–</span>
        <label class="field score-form__team">
          <span class="field__label">${match.team2.map((p) => matchName(match, p)).join(' & ')}</span>
          <input class="input score-form__input num" name="t2" type="number" min="0" max="99" step="1" inputmode="numeric" value="${match.score?.t2 ?? ''}" required>
        </label>
      </div>`,
    validate: ({ t1, t2 }) => {
      const a = t1 === '' ? NaN : Number(t1);
      const b = t2 === '' ? NaN : Number(t2);
      const v = validateScore(a, b);
      if (!v.ok) return 'Scores are whole numbers from 0 to 99.';
      const key = `${a}-${b}`;
      if (v.warnings.length && warned !== key) {
        warned = key;
        return `${v.warnings.map((w) => WARN[w]).join(' ')} Tap Save score again to keep it.`;
      }
      return null;
    },
  });
  if (!values) return;
  ctx.sync.track(scoreMatch(ctx.sid, match, ctx.uid, { t1: Number(values.t1), t2: Number(values.t2) })).catch(report('save the score'));
}

export async function swapDialog(ctx, match) {
  const busy = busyPids(ctx.matches);
  const bench = ctx.participants.filter((p) => p.status === 'here' && !busy.has(p.pid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!bench.length) { showToast('Nobody is free to swap in — mark someone Here first.'); return; }
  const values = await openDialog({
    title: 'Swap a player',
    submitLabel: 'Swap',
    body: html`
      <fieldset class="field dialog__choices">
        <legend class="field__label">Take off</legend>
        ${[...match.team1, ...match.team2].map((pid, i) => html`
          <label class="choice"><input type="radio" name="out" value="${pid}" ${i === 0 ? 'checked' : ''}><span>${matchName(match, pid)}</span></label>`)}
      </fieldset>
      <label class="field">
        <span class="field__label">Put on</span>
        <select class="input" name="in">${bench.map((p) => html`<option value="${p.pid}">${p.displayName}</option>`)}</select>
      </label>`,
  });
  if (!values) return;
  const inName = bench.find((p) => p.pid === values.in)?.displayName ?? '?';
  ctx.sync.track(swapInMatch(ctx.sid, match, values.out, values.in, inName, busy)).catch(report('swap'));
}

export async function cancelDialog(ctx, match, courtName) {
  const names = [...match.team1, ...match.team2].map((p) => matchName(match, p)).join(', ');
  const values = await openDialog({
    title: 'Cancel match',
    submitLabel: 'Cancel this match',
    danger: true,
    body: html`
      <p class="modal__message">${courtName}: ${names}. No score will be recorded.</p>
      <fieldset class="field dialog__choices">
        <legend class="field__label">Players</legend>
        <label class="choice"><input type="radio" name="fate" value="queue" checked><span>Back to the queue <span class="choice__hint">They go to the back of the line.</span></span></label>
        <label class="choice"><input type="radio" name="fate" value="hold"><span>Put them On hold <span class="choice__hint">They stay in the session but off the queue.</span></span></label>
      </fieldset>`,
  });
  if (!values) return;
  ctx.sync.track(cancelGame(ctx.sid, match, values.fate)).catch(report('cancel the match'));
}
```

- [ ] **Step 3: Tabs**

Create `features/session/courts.js`:

```js
// Courts tab: live courts with timers; score / swap / cancel; add, rename and
// pause courts; "Up next" from the host's live state.
import { html } from '../../lib/html.js';
import { formatClock } from '../../lib/time-format.js';
import { showToast } from '../../lib/toast.js';
import { openDialog } from '../../lib/dialog.js';
import { updateSession } from '../../lib/sessions.js';
import { addCourt, renameCourt, toggleCourtPaused, MAX_COURTS, COURT_NAME_MAX } from '../../lib/session-model.js';
import { playingMatches, teamHtml, scoreDialog, swapDialog, cancelDialog, isEnded } from './floor.js';

function courtHtml(court, match, holding, live, ended) {
  const names = live?.names ?? {};
  return html`
    <article class="court ${match ? 'court--playing' : ''} ${court.paused ? 'court--paused' : ''}">
      <header class="court__head">
        <h2 class="court__name">${court.name}</h2>
        ${match ? html`<span class="court__timer num" data-since="${match.startedAt}"></span>` : ''}
        ${court.paused ? html`<span class="pill">Paused</span>` : ''}
      </header>
      ${match
        ? html`<div class="court__teams">${teamHtml(match, 'team1')}<span class="court__vs">vs</span>${teamHtml(match, 'team2')}</div>
            ${ended ? '' : html`<div class="court__actions">
              <button type="button" class="btn btn--primary btn--sm" data-score="${match.mid}">Enter score</button>
              <button type="button" class="btn btn--secondary btn--sm" data-swap="${match.mid}">Swap</button>
              <button type="button" class="btn btn--ghost btn--sm" data-cancel="${match.mid}">Cancel match</button>
            </div>`}`
        : html`<p class="court__empty">${court.paused ? 'Paused — no new games here.'
          : holding.length ? html`Winners waiting: ${holding.map((p) => names[p] ?? '?').join(' & ')}`
            : 'Waiting for players…'}</p>`}
      ${ended ? '' : html`<div class="court__tools">
        <button type="button" class="btn btn--ghost btn--sm" data-rename="${court.id}">Rename</button>
        <button type="button" class="btn btn--ghost btn--sm" data-pause="${court.id}">${court.paused ? 'Resume' : 'Pause'}</button>
      </div>`}
    </article>`;
}

function upNextHtml(live) {
  const next = (live?.queue ?? []).slice(0, 4).flatMap((q) => q.pids);
  if (!next.length) return html`<p class="page__sub">Nobody waiting. Mark players Here on the Players tab.</p>`;
  return html`<ol class="up-next">${next.map((pid) => html`<li>${live.names?.[pid] ?? '?'}</li>`)}</ol>`;
}

export function mount(panel, ctx) {
  panel.innerHTML = html`
    <div class="courts" data-courts></div>
    <section class="card up-next-card">
      <h2 class="card__title">Up next</h2>
      <div data-next></div>
    </section>
    <button type="button" class="btn btn--secondary btn--block" data-add>+ Add court</button>`;

  panel.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const match = (id) => ctx.matches.find((m) => m.mid === id);
    const courts = ctx.session.courts;
    const save = (next) => ctx.sync.track(updateSession(ctx.sid, { courts: next })).catch((err) => showToast(`Couldn't update courts: ${err.message}`, 'error'));
    if (t.dataset.score) scoreDialog(ctx, match(t.dataset.score));
    else if (t.dataset.swap) swapDialog(ctx, match(t.dataset.swap));
    else if (t.dataset.cancel) {
      const m = match(t.dataset.cancel);
      cancelDialog(ctx, m, courts.find((c) => c.id === m.courtId)?.name ?? 'Court');
    } else if (t.dataset.pause) save(toggleCourtPaused(courts, t.dataset.pause));
    else if (t.dataset.rename) {
      const court = courts.find((c) => c.id === t.dataset.rename);
      const values = await openDialog({
        title: 'Rename court',
        body: html`<label class="field"><span class="field__label">Court name</span><input class="input" name="name" maxlength="${COURT_NAME_MAX}" value="${court.name}"></label>`,
        validate: ({ name }) => (name.trim() ? null : 'Give the court a name.'),
      });
      if (values) save(renameCourt(ctx.session.courts, court.id, values.name));
    } else if (t.hasAttribute('data-add')) {
      if (courts.length >= MAX_COURTS) { showToast(`Up to ${MAX_COURTS} courts.`); return; }
      save(addCourt(courts));
    }
  });

  return {
    update(c) {
      const ended = isEnded(c);
      const byCourt = new Map(playingMatches(c.matches).map((m) => [m.courtId, m]));
      const holding = new Map((c.live?.courts ?? []).map((lc) => [lc.courtId, lc.holding ?? []]));
      panel.querySelector('[data-courts]').innerHTML = html`${c.session.courts.map((court) => courtHtml(court, byCourt.get(court.id), holding.get(court.id) ?? [], c.live, ended))}`;
      panel.querySelector('[data-next]').innerHTML = upNextHtml(c.live);
      panel.querySelector('[data-add]').hidden = ended;
      panel.querySelectorAll('[data-since]').forEach((el) => { el.textContent = formatClock(Date.now() - Number(el.dataset.since)); });
    },
  };
}
```

Create `features/session/players.js`:

```js
// Players tab: paste a roster / add names, Here · On hold · Left, and the
// queue order with "Up next" (v1 parity).
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { parseNames, dedupeNames } from '../../lib/roster-parse.js';
import { addGuests, setParticipantStatus, setManyStatus } from '../../lib/sessions.js';
import { playingMatches, isEnded } from './floor.js';

const STATUSES = [['here', 'Here'], ['break', 'On hold'], ['left', 'Left']];

function rowHtml(p, where, ended) {
  return html`
    <li class="player-row player-row--${p.status}">
      <span class="player-row__name">${p.displayName}${where ? html` <span class="player-row__where">${where}</span>` : ''}</span>
      <span class="seg" role="group" aria-label="${p.displayName} status">
        ${STATUSES.map(([value, label]) => html`<button type="button" class="seg__btn" data-pid="${p.pid}" data-status="${value}" aria-pressed="${p.status === value}" ${ended ? 'disabled' : ''}>${label}</button>`)}
      </span>
    </li>`;
}

export function mount(panel, ctx) {
  panel.innerHTML = html`
    <form class="card roster-form" data-roster novalidate>
      <label class="field">
        <span class="field__label">Add players</span>
        <textarea class="input roster-form__text" name="names" rows="4" placeholder="Paste your list — one name per line"></textarea>
        <span class="field__hint">Numbering, headers and @mentions from a group-chat list are ignored. Names already here are skipped.</span>
      </label>
      <label class="check"><input type="checkbox" name="here" checked> Mark everyone here</label>
      <button class="btn btn--primary" type="submit">Add players</button>
    </form>
    <section class="card">
      <div class="players__head">
        <h2 class="card__title" data-count>Players</h2>
        <span class="players__bulk">
          <button type="button" class="btn btn--ghost btn--sm" data-all="here">All here</button>
          <button type="button" class="btn btn--ghost btn--sm" data-all="break">All on hold</button>
        </span>
      </div>
      <ul class="player-list" data-list></ul>
    </section>
    <section class="card">
      <h2 class="card__title">Queue</h2>
      <ol class="queue-list" data-queue></ol>
    </section>`;

  const form = panel.querySelector('[data-roster]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { add, skipped } = dedupeNames(parseNames(form.elements.names.value), ctx.participants.map((p) => p.displayName));
    if (!add.length) { showToast(skipped ? 'Everyone on that list is already here.' : 'No names found — one name per line.'); return; }
    ctx.sync.track(addGuests(ctx.sid, add, form.elements.here.checked ? 'here' : 'break'))
      .catch((err) => showToast(`Couldn't add players: ${err.message}`, 'error'));
    form.elements.names.value = '';
    showToast(skipped ? `${add.length} added, ${skipped} skipped (already here).` : `${add.length} player${add.length > 1 ? 's' : ''} added.`, 'success');
  });

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const fail = (err) => showToast(`Couldn't update: ${err.message}`, 'error');
    if (btn.dataset.pid) {
      if (btn.getAttribute('aria-pressed') === 'true') return;
      ctx.sync.track(setParticipantStatus(ctx.sid, btn.dataset.pid, btn.dataset.status)).catch(fail);
    } else if (btn.dataset.all) {
      const pids = ctx.participants.filter((p) => p.status !== 'left' && p.status !== btn.dataset.all).map((p) => p.pid);
      if (pids.length) ctx.sync.track(setManyStatus(ctx.sid, pids, btn.dataset.all)).catch(fail);
    }
  });

  return {
    update(c) {
      const ended = isEnded(c);
      form.hidden = ended;
      panel.querySelector('.players__bulk').hidden = ended;
      const courtName = new Map(c.session.courts.map((ct) => [ct.id, ct.name]));
      const where = new Map();
      playingMatches(c.matches).forEach((m) => [...m.team1, ...m.team2].forEach((pid) => where.set(pid, `Playing · ${courtName.get(m.courtId) ?? ''}`)));
      const queue = (c.live?.queue ?? []).flatMap((q) => q.pids);
      queue.forEach((pid, i) => { if (!where.has(pid)) where.set(pid, i < 4 ? 'Up next' : `#${i + 1} in line`); });
      const list = [...c.participants].sort((a, b) => (a.checkedInAt ?? 0) - (b.checkedInAt ?? 0));
      const count = (s) => list.filter((p) => p.status === s).length;
      panel.querySelector('[data-count]').textContent = `Players · ${count('here')} here · ${count('break')} on hold`;
      panel.querySelector('[data-list]').innerHTML = list.length
        ? html`${list.map((p) => rowHtml(p, p.status === 'here' ? where.get(p.pid) : null, ended))}`
        : html`<li class="page__sub">No players yet — paste your list above.</li>`;
      panel.querySelector('[data-queue]').innerHTML = queue.length
        ? html`${queue.map((pid, i) => html`<li class="${i < 4 ? 'queue-list__next' : ''}">${c.live.names?.[pid] ?? '?'}</li>`)}`
        : html`<li class="page__sub">Nobody waiting.</li>`;
    },
  };
}
```

Create `features/session/scores.js`:

```js
// Scores tab: game history, newest first; edit a past score (an override).
import { html } from '../../lib/html.js';
import { formatClock } from '../../lib/time-format.js';
import { gameHistory } from '../../lib/session-export.js';
import { teamHtml, scoreDialog } from './floor.js';

export function mount(panel, ctx) {
  panel.innerHTML = html`<section class="card"><h2 class="card__title">Game history</h2><ol class="history" data-history reversed></ol></section>`;
  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) scoreDialog(ctx, ctx.matches.find((m) => m.mid === btn.dataset.edit));
  });
  return {
    update(c) {
      const courtName = new Map(c.session.courts.map((ct) => [ct.id, ct.name]));
      const games = gameHistory(c.matches);
      panel.querySelector('[data-history]').innerHTML = games.length
        ? html`${games.map((m, i) => ({ m, round: i + 1 })).reverse().map(({ m, round }) => html`
            <li class="history__row">
              <span class="history__meta">Game ${round} · ${courtName.get(m.courtId) ?? m.courtId}${m.endedAt != null ? html` · ${formatClock(m.endedAt - m.startedAt)}` : ''}</span>
              <span class="history__teams">${teamHtml(m, 'team1')} <strong class="history__score num">${m.score.t1}–${m.score.t2}</strong> ${teamHtml(m, 'team2')}</span>
              <button type="button" class="btn btn--ghost btn--sm" data-edit="${m.mid}">Edit</button>
            </li>`)}`
        : html`<li class="page__sub">No games scored yet.</li>`;
    },
  };
}
```

Create `features/session/rankings.js`:

```js
// Rankings tab: the session leaderboard with v1's four sort options.
import { html } from '../../lib/html.js';
import { rankingsHtml, SORTS } from '../shared/rankings-table.js';

export function mount(panel, ctx) {
  let sort = 'wins';
  panel.innerHTML = html`
    <section class="card">
      <div class="seg seg--wide" role="group" aria-label="Sort rankings by">
        ${SORTS.map(([key, label]) => html`<button type="button" class="seg__btn" data-sort="${key}" aria-pressed="${key === sort}">${label}</button>`)}
      </div>
      <div class="rankings-wrap" data-table></div>
    </section>`;
  const draw = () => {
    panel.querySelectorAll('[data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
    panel.querySelector('[data-table]').innerHTML = rankingsHtml(ctx.matches, sort);
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (b) { sort = b.dataset.sort; draw(); }
  });
  return { update(c) { ctx = c; draw(); } };
}
```

Create `features/session/settings.js`:

```js
// Settings tab: court rule, share link + QR show/hide, export, end/continue.
import { html, raw } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { showConfirm } from '../../lib/confirm.js';
import { appUrl } from '../../lib/app-url.js';
import { updateSession, endSession, continueSession } from '../../lib/sessions.js';
import { exportCsv, exportJson, exportFilename } from '../../lib/session-export.js';
import { COURT_RULES } from '../../lib/session-model.js';
import { isEnded } from './floor.js';

const RULE_LABELS = { everyoneOff: 'Everyone off', winnersStay: 'Winners stay', winnersSplit: 'Winners split' };

function download(text, type, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function mount(panel, ctx) {
  const liveUrl = appUrl(window.location, `#/tv/${ctx.sid}`);
  panel.innerHTML = html`
    <form class="card settings__rule" data-rule novalidate>
      <h2 class="card__title">Court rule</h2>
      <label class="field"><span class="field__label">After each game</span>
        <select class="input" name="type">${COURT_RULES.map((r) => html`<option value="${r}">${RULE_LABELS[r]}</option>`)}</select>
      </label>
      <label class="field" data-maxwins><span class="field__label">Max wins in a row</span>
        <input class="input" type="number" name="maxWins" min="1" max="5" step="1" inputmode="numeric">
      </label>
      <button class="btn btn--primary" type="submit">Save rule</button>
    </form>
    <section class="card settings__share">
      <h2 class="card__title">Share the live view</h2>
      <p class="page__sub">Courts, queue and rankings for players and a TV — no sign-in needed.</p>
      <div class="settings__link"><input class="input" readonly value="${liveUrl}" aria-label="Live view link"><button type="button" class="btn btn--secondary" data-copy>Copy</button></div>
      <a class="btn btn--ghost" href="${liveUrl}" target="_blank" rel="noopener">Open live view ↗</a>
      <label class="check"><input type="checkbox" data-qr-toggle> Show the QR code on the live view</label>
      <div class="settings__qr" data-qr></div>
    </section>
    <section class="card settings__export">
      <h2 class="card__title">Export</h2>
      <div class="settings__row">
        <button type="button" class="btn btn--secondary" data-export="csv">⬇ CSV</button>
        <button type="button" class="btn btn--secondary" data-export="json">⬇ JSON</button>
      </div>
    </section>
    <section class="card settings__end">
      <h2 class="card__title" data-end-title>End session</h2>
      <p class="page__sub" data-end-text></p>
      <button type="button" class="btn" data-end></button>
    </section>`;

  const ruleForm = panel.querySelector('[data-rule]');
  const syncMaxWins = () => { panel.querySelector('[data-maxwins]').hidden = ruleForm.elements.type.value === 'everyoneOff'; };
  ruleForm.addEventListener('change', syncMaxWins);
  ruleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = ruleForm.elements.type.value;
    const maxWins = Number(ruleForm.elements.maxWins.value);
    if (type !== 'everyoneOff' && (!Number.isInteger(maxWins) || maxWins < 1 || maxWins > 5)) { showToast('Max wins: 1 to 5.', 'error'); return; }
    ctx.sync.track(updateSession(ctx.sid, { courtRule: { type, maxWins: type === 'everyoneOff' ? 2 : maxWins } }))
      .catch((err) => showToast(`Couldn't save: ${err.message}`, 'error'));
    showToast('Court rule saved — it applies from the next game.', 'success');
  });

  // The QR is generated once (lazily, like the player card).
  import('../../lib/qr.js').then(({ qrSvg }) => {
    panel.querySelector('[data-qr]').innerHTML = html`${raw(qrSvg(liveUrl))}`;
  }).catch(() => { panel.querySelector('[data-qr]').textContent = 'QR code unavailable — check your connection.'; });

  panel.addEventListener('change', (e) => {
    if (!e.target.matches('[data-qr-toggle]')) return;
    ctx.sync.track(updateSession(ctx.sid, { shareQr: e.target.checked })).catch((err) => showToast(`Couldn't save: ${err.message}`, 'error'));
  });
  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-copy')) {
      navigator.clipboard.writeText(liveUrl).then(() => showToast('Link copied.', 'success'), () => showToast('Copy failed — select the link and copy it.', 'error'));
    } else if (btn.dataset.export) {
      const s = ctx.session;
      if (btn.dataset.export === 'csv') download(exportCsv(s, ctx.participants, ctx.matches), 'text/csv', exportFilename(s.name, s.date, 'csv'));
      else download(JSON.stringify(exportJson(s, ctx.participants, ctx.matches, Date.now()), null, 2), 'application/json', exportFilename(s.name, s.date, 'json'));
    } else if (btn.hasAttribute('data-end')) {
      if (isEnded(ctx)) {
        ctx.sync.track(continueSession(ctx.sid)).catch((err) => showToast(`Couldn't continue: ${err.message}`, 'error'));
        return;
      }
      const ok = await showConfirm({ title: 'End this session?', message: 'The queue stops and the clock freezes. You can export now, fix scores later, or continue the session.', confirmLabel: 'End session', danger: true });
      if (ok) ctx.sync.track(endSession(ctx.sid)).catch((err) => showToast(`Couldn't end: ${err.message}`, 'error'));
    }
  });

  return {
    update(c) {
      const s = c.session;
      // Only refill the rule form when it isn't being edited.
      if (!ruleForm.contains(document.activeElement)) {
        ruleForm.elements.type.value = s.courtRule?.type ?? 'everyoneOff';
        ruleForm.elements.maxWins.value = s.courtRule?.maxWins ?? 2;
        syncMaxWins();
      }
      panel.querySelector('[data-qr-toggle]').checked = !!s.shareQr;
      const ended = isEnded(c);
      panel.querySelector('[data-end-title]').textContent = ended ? 'Session ended' : 'End session';
      panel.querySelector('[data-end-text]').textContent = ended ? 'Continue to restart the queue and the clock.' : 'Stops the queue and freezes the clock.';
      const btn = panel.querySelector('[data-end]');
      btn.textContent = ended ? 'Continue session' : 'End session';
      btn.className = `btn ${ended ? 'btn--accent' : 'btn--danger'}`;
    },
  };
}
```

- [ ] **Step 4: Styles**

Create `features/session/session.css`:

```css
/* Organizer session view (#/s/{sid}) */
.session__head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; }
.session__title { min-width: 0; }
.session__status { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.session__clock { font-size: 1.4rem; font-weight: 800; }
.sync-dot { font-size: 0.75rem; font-weight: 700; color: var(--color-muted); display: inline-flex; align-items: center; gap: 6px; }
.sync-dot::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); }
.sync-dot[data-state="syncing"]::before { background: var(--color-highlight); }
.sync-dot[data-state="offline"]::before { background: var(--color-danger); }

.session__banner { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; padding: 10px var(--space-3); border-radius: var(--radius); font-weight: 700; font-size: 0.88rem; background: var(--color-tint); color: var(--color-text); }
.session__banner--waiting, .session__banner--other { background: var(--color-surface-2); color: var(--color-muted); }
.session__banner--ended { border-left: 5px solid var(--color-highlight); }

.tabs { display: flex; gap: 0; overflow-x: auto; border-bottom: 2px solid var(--color-border); scrollbar-width: none; }
.tabs__tab { flex: 1 0 auto; font: inherit; font-weight: 700; font-size: 0.85rem; min-height: var(--tap); padding: 0 6px; border: 0; background: none; color: var(--color-muted); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; white-space: nowrap; }
.tabs__tab[aria-selected="true"] { color: var(--color-text); border-bottom-color: var(--color-primary); }
.tabs__tab:focus-visible { outline: 3px solid var(--color-focus); outline-offset: -3px; }
.tabs__panel { display: flex; flex-direction: column; gap: var(--space-3); }
.tabs__panel[hidden] { display: none; }

/* Courts */
.courts { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
.court { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-3); box-shadow: var(--shadow-md); display: flex; flex-direction: column; gap: var(--space-2); }
.court--playing { border-top: 5px solid var(--color-accent); }
.court--paused { opacity: 0.75; }
.court__head { display: flex; align-items: center; gap: var(--space-2); }
.court__name { font-size: 1.05rem; flex: 1; }
.court__timer { font-weight: 800; color: var(--color-muted); }
.court__teams { display: flex; flex-direction: column; gap: 4px; }
.court__vs { font-size: 0.72rem; font-weight: 800; color: var(--color-muted); text-transform: uppercase; }
.court__empty { color: var(--color-muted); font-weight: 600; }
.court__actions, .court__tools { display: flex; gap: 6px; flex-wrap: wrap; }
.court__tools { border-top: 1px solid var(--color-border); padding-top: var(--space-2); }
.team { font-weight: 800; padding: 6px 10px; border-radius: var(--radius); }
.team--1 { background: var(--color-primary); color: var(--color-on-dark); }
.team--2 { background: var(--color-highlight); color: var(--color-highlight-ink); }
.team__amp { font-weight: 500; }
.up-next { margin: 0; padding-left: 1.4em; display: grid; grid-template-columns: 1fr 1fr; gap: 4px var(--space-3); font-weight: 700; }

/* Players */
.roster-form { display: flex; flex-direction: column; gap: var(--space-2); }
.roster-form__text { resize: vertical; min-height: 110px; }
.players__head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-2); }
.player-list, .queue-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.player-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 6px 0; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
.player-row--here { background: linear-gradient(90deg, var(--color-tint), transparent 60%); }
.player-row--left .player-row__name { color: var(--color-muted); text-decoration: line-through; }
.player-row__name { font-weight: 700; min-width: 0; padding-left: 6px; }
.player-row__where { font-size: 0.75rem; font-weight: 700; color: var(--color-muted); }
.queue-list { list-style: decimal; padding-left: 1.6em; gap: 2px; font-weight: 600; }
.queue-list__next { font-weight: 800; color: var(--color-text); }
.queue-list__next::marker { color: var(--color-highlight); }

/* Scores */
.history { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.history__row { display: grid; grid-template-columns: 1fr auto; gap: 4px var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); align-items: center; }
.history__meta { grid-column: 1 / -1; font-size: 0.75rem; font-weight: 700; color: var(--color-muted); }
.history__teams { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.history__score { font-size: 1.1rem; }

.score-form { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: var(--space-2); }
.score-form__input { font-size: 1.6rem; font-weight: 800; text-align: center; }
.score-form__vs { font-size: 1.6rem; font-weight: 800; padding-bottom: 8px; }

/* Rankings (also used by the TV view) */
.rankings-wrap { overflow-x: auto; }
.rankings { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.rankings th, .rankings td { padding: 8px 6px; text-align: right; border-bottom: 1px solid var(--color-border); }
.rankings thead th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-muted); }
.rankings th[scope="row"], .rankings thead th:nth-child(2) { text-align: left; }
.rankings tbody tr:nth-child(-n+3) td:first-child { color: var(--color-highlight); font-weight: 800; }

/* Settings */
.settings__rule, .settings__share, .settings__export, .settings__end { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.settings__rule .field, .settings__link { width: 100%; }
.settings__link { display: flex; gap: var(--space-2); }
.settings__row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.settings__qr { width: 200px; max-width: 100%; background: var(--color-qr-bg); padding: 8px; border-radius: var(--radius); }
.settings__qr svg { display: block; width: 100%; height: auto; }
```

- [ ] **Step 5: Verify**

Run: `npm test` → PASS. Then run the Task 7 browser checks B1–B6 now (they exercise this view) and fix anything before committing.

- [ ] **Step 6: Commit**

```bash
git add lib/app.js features/session
git commit -m "feat(sessions): organizer session view — courts, players, scores, rankings, settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Whole-flow browser check, docs, spec deltas

**Files:**
- Modify: `docs/INDEX.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md`

**Interfaces:**
- Consumes: the whole app.
- Produces: verified 3a + updated docs.

- [ ] **Step 1: Automated checks**

Run: `npm test` → PASS (≈172). Run: `npm run test:rules` → PASS (46).

- [ ] **Step 2: Browser checks on `?emulators`** (Playwright or by hand; `npm run emulators` + `npm run serve`, `http://localhost:5174/?emulators`)

| # | Check | Expected |
|---|---|---|
| B1 | Create "Sat Open Play", 2 courts, Everyone off. Players tab → paste `Participants (10)` + `1. Ana` … `10. Jo` + `@everyone` → Add players | Toast "10 players added."; both courts fill at once; banner "This device is running the queue"; Up next shows the 2 waiting |
| B2 | Court 1 → Enter score 11–10 | Warning "Winning by 1 is unusual…"; Save again → court refills with the next four (never-played first) |
| B3 | Start typing in the paste box, then score a game on a second tab/device | Typed text survives the re-render |
| B4 | Court 2 → Cancel match → "Put them On hold" | Court 2 shows "Waiting for players…" if < 4 free; those four show On hold on the Players tab; no score in history |
| B5 | Court 1 → Swap → pick a player out and a free player in | Names update on the court; swapped-out player is back in line |
| B6 | Scores → Edit → change to 11–5; Rankings → sort by Points | History and rankings update; +/- recalculated |
| B7 | Copy the live link (Settings) and open it in a **signed-out** window at 1600×900 and at 390 px | Dark live view: courts with timers, Up next, rankings, QR (toggle hides it); no topbar or boot screen |
| B8 | Settings → Export CSV / JSON; End session → Continue | Files named `Sat-Open-Play-<date>.csv/json`; ended banner, clock frozen, TV shows "Session ended"; Continue resumes hosting |
| B9 | Open the session in a second tab | Tab 2: "Queue run by your other device"; navigate tab 1 to My sessions → within ~5 s tab 2 says "This device is running the queue" and keeps filling courts |
| B10 | DevTools → offline → enter a score | Sync dot "Offline — changes will sync"; court refills locally; back online → "Saved" |
| B11 | Sign in as a second account and open `#/s/{sid}`; then delete the session from My sessions while the TV window is open | Second account: "Only organizers can run this session" + Open the live view; TV: "Session not found" |
| B12 | 320 px and 390 px widths, light + dark | No sideways scroll; all five tabs visible at 390 px; buttons ≥ 44 px |

- [ ] **Step 3: Docs**

`docs/INDEX.md`:
- **Features** table: replace the `home` row with
  `| \`home\` | My Sessions: live → upcoming → past, create, delete (owner). | Spec §13.1 · Plan 3a |`
  and add rows:
  `| \`new-session\` | Create session: name, date, venue, courts, court rule (fairness in 3a). | Spec §13.1 · Plan 3a |`
  `| \`session\` | Organizer view \`#/s/{sid}\`: courts (score/swap/cancel/pause), players (paste roster, Here/On hold/Left, queue), scores (edit), rankings, settings (rule, share/QR, export, end/continue); runs the host. | Spec §13 · Plan 3a |`
  `| \`tv\` | Public live view \`#/tv/{sid}\`: courts, Up next, rankings, QR; no sign-in. | Spec §13.1 · Plan 3a |`
- **Architecture** table: add
  `| Host device | \`lib/host.js\` holds the per-tab lease on \`sessions.host\` (5 s beat, 20 s stale, released on leave) and commits \`hostStep()\` output (new matches + \`live/state\`). | \`lib/host-lease.js\`, \`lib/host-step.js\`, spec §13.4 |`
  and extend the "Game rules (pure)" row's module list with `roster-parse`, `session-model`, `time-format`, `session-export`, `sync-status`, `host-lease`, `host-step`.
- **Plans** table: mark the Plan 3a row ✅ done (the row was added with the plan).
- **Key decisions**: add
  `| 2026-10-03 | Match ids \`\${courtId}_\${n}\`; host steps on snapshots only (no 1 s tick); lease per tab, released on leave; 3a participants are guests only. | Deterministic, bounded ids; nothing time-based in fairness; fast handover; 3b adds real players. |`

`AGENTS.md` → "Pure logic" list: add `roster-parse`, `session-model`, `time-format`, `session-export`, `sync-status`, `host-lease`, `host-step`. "Browser / services" list: add `sessions`, `host`, `dialog`.

Spec §13: in §13.3 replace ``Match ids are deterministic: `${courtId}_${prevMid ?? 'first'}` (carried forward from Plan 1).`` with ``Match ids are deterministic: `${courtId}_${n}`, n = the sequence on that court (`nextMatchId`), so two devices agree and ids stay short.``; in §13.4 replace "on every relevant snapshot and on a 1 s tick" with "on every relevant snapshot (no tick — nothing in fairness/court rules is time-based)" and append "The lease is per browser tab and is released when the organizer leaves the session view; ending a session clears it."; in §13.5 participants row append "Guests only in 3a (`isGuest == true`, `uid == null`, `g_…` ids)."; in §13.1 `#/tv` row append "Always dark; topbar hidden."

- [ ] **Step 4: Commit**

```bash
git add docs/INDEX.md AGENTS.md docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md
git commit -m "docs: Plan 3a index, AGENTS module lists, spec §13 deltas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand over for the localhost check**

Leave `npm run emulators` and `npm run serve` running and tell the user: sandbox at `http://localhost:5174/?emulators`; live data at `http://localhost:5174/` (real — sessions created there are real; rules must be deployed first for live sessions to save: **ask before `npx --prefix rules-tests firebase deploy --only firestore:rules`**). No push, PR, or deploy without an explicit request.

## Carried forward to 3b/3c

- Player self check-in (QR → `#/join/{sid}`), name-only check-in with approval, link a guest to a profile, `results` log writes, player score submit/confirm (3b). The TV QR currently opens the live view; 3b points it at `#/join/{sid}`.
- Stacking mode, co-organizers (`organizerIds` edits), forced takeover "Make this device the host" (3c).
- Swapping a player after a game was scored doesn't log a correction (Plan 1 note) — matters once `results` exist (3b).
- A clock-skewed device (> 20 s ahead) can see a live lease as stale and take it over; handover is clean (transaction + `mine` check), so this is a takeover, never two hosts. Revisit with server timestamps if it shows up.
- Firestore backups (needs the Blaze plan) once real session data exists.
