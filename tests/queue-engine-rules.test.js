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

test('stacking + winners stay: earliest-first fills the court, not greedy first-fit', () => {
  // Winners a b hold c1. Queue: solo s, then pair p (ready).
  // Greedy first-fit takes s (1 slot), leaving 1 slot empty — pair won't fit, s blocks forever.
  // Include-first DFS skips s; s alone can't fill the 2 open slots; pair p fills exactly. s stays in queue.
  const ps = players('a b c d e f');
  const entries = [entry('s', 'c', { at: 1, accepted: 'c' }), entry('p', 'd e', { at: 2 })];
  const out = run({ mode: 'stacking', rule: stay, participants: ps, entries, matches: [firstGame()], courtList: courts(1) });
  assert.equal(out.newMatches.length, 1);
  assert.deepEqual(out.newMatches[0].team1, ['a', 'b']);
  assert.deepEqual([...out.newMatches[0].team2].sort(), ['d', 'e']);
  assert.deepEqual(out.entryUpdates, [{ eid: 'p', status: 'assigned' }]);
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['s']);
});

const noDoubleBooking = (out, matches = []) => {
  const live = [...matches.filter((m) => m.status === 'playing'), ...out.newMatches];
  const all = live.flatMap((m) => [...m.team1, ...m.team2]);
  assert.equal(new Set(all).size, all.length, `double-booked: ${all}`);
};

test('unpaused court: winners already live on another court are not held or double-booked', () => {
  const m1 = done('c1', ['a', 'b'], ['c', 'd'], [11, 5], { startedAt: 10, endedAt: 20 });
  const m2 = { mid: 'm_c2_30', courtId: 'c2', team1: ['a', 'b'], team2: ['e', 'f'], status: 'playing', startedAt: 30 };
  const out = run({ rule: stay, participants: players('a b c d e f g h'), matches: [m1, m2], courtList: courts(2) });
  assert.deepEqual(out.state.courts[0].holding, []);
  assert.equal(out.newMatches.length, 1);
  assert.deepEqual(out.newMatches[0].streaks, {});
  noDoubleBooking(out, [m2]);
});

test('rule changed to winners stay: winners who played a later match elsewhere are not held', () => {
  const m1 = done('c1', ['a', 'b'], ['c', 'd'], [11, 5], { startedAt: 10, endedAt: 20 });
  const m2 = done('c2', ['a', 'b'], ['e', 'f'], [5, 11], { startedAt: 30, endedAt: 40 });
  const out = run({ rule: stay, participants: players('a b c d e f g h'), matches: [m1, m2], courtList: courts(2) });
  assert.deepEqual(out.state.courts[0].holding, []);
  const c1 = out.newMatches.find((m) => m.courtId === 'c1');
  assert.deepEqual(c1.streaks, {});
  noDoubleBooking(out);
});

test('stacking + winners stay: held winners are released when only a ready group of 4 fits', () => {
  const out = run({
    mode: 'stacking', rule: stay, participants: players('a b c d g h i j'),
    entries: [entry('g', 'g h i j', { at: 1 })], matches: [firstGame()],
  });
  assert.deepEqual(teams(out), [['g', 'h'], ['i', 'j']]);
  assert.deepEqual(out.newMatches[0].streaks, {});
  assert.deepEqual(out.state.courts[0].holding, []);
  assert.deepEqual(out.entryUpdates, [{ eid: 'g', status: 'assigned' }]);
});

test('makeId gets the match context: court and previous match on it', () => {
  const calls = [];
  run({ participants: players('a b c d e f g h'), courtList: courts(2), makeId: (ctx) => { calls.push(ctx); return `x${calls.length}`; },
    matches: [firstGame()] });
  assert.deepEqual(calls, [
    { kind: 'match', courtId: 'c1', prevMid: 'm_c1_10' },
    { kind: 'match', courtId: 'c2', prevMid: null },
  ]);
});
