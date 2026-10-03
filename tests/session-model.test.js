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
