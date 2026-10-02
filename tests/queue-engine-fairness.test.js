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
