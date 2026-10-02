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

test('four solos then a pair → the four solos go on (earliest first)', () => {
  const ps = players('a b c d e f');
  const entries = [entry('sa', 'a', { at: 1 }), entry('sb', 'b', { at: 2 }), entry('sc', 'c', { at: 3 }), entry('sd', 'd', { at: 4 }), entry('p', 'e f', { at: 5 })];
  const out = run({ ...S, participants: ps, entries });
  assert.equal(out.newMatches.length, 1);
  assert.deepEqual([out.newMatches[0].team1.sort(), out.newMatches[0].team2.sort()], [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(out.entryUpdates, [{ eid: 'sa', status: 'assigned' }, { eid: 'sb', status: 'assigned' }, { eid: 'sc', status: 'assigned' }, { eid: 'sd', status: 'assigned' }]);
  assert.deepEqual(out.state.queue, [{ eid: 'p', pids: ['e', 'f'], ready: true }]);
});

test('earliest-first combination: solo, pair, pair → fills court with pair+pair', () => {
  const ps = players('a b c d e');
  const entries = [entry('s', 'a', { at: 1 }), entry('p1', 'b c', { at: 2 }), entry('p2', 'd e', { at: 3 })];
  const out = run({ ...S, participants: ps, entries });
  assert.equal(out.newMatches.length, 1);
  const teams = [out.newMatches[0].team1.sort(), out.newMatches[0].team2.sort()].sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(teams, [['b', 'c'], ['d', 'e']]);
  assert.deepEqual(out.entryUpdates, [{ eid: 'p1', status: 'assigned' }, { eid: 'p2', status: 'assigned' }]);
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['s']);
});

test('earliest-first combination: 3 solos then pair → fills court with 2 solos + pair', () => {
  const ps = players('a b c d e');
  const entries = [entry('s1', 'a', { at: 1 }), entry('s2', 'b', { at: 2 }), entry('s3', 'c', { at: 3 }), entry('p', 'd e', { at: 4 })];
  const out = run({ ...S, participants: ps, entries });
  assert.equal(out.newMatches.length, 1);
  const teams = [out.newMatches[0].team1.sort(), out.newMatches[0].team2.sort()].sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(teams, [['a', 'b'], ['d', 'e']]);
  assert.deepEqual(out.entryUpdates, [{ eid: 's1', status: 'assigned' }, { eid: 's2', status: 'assigned' }, { eid: 'p', status: 'assigned' }]);
  assert.deepEqual(out.state.queue.map((q) => q.eid), ['s3']);
});

test('an entry naming a player missing from participants keeps its place, not ready', () => {
  const out = run({ ...S, participants: players('a'), entries: [entry('e1', 'a b', { at: 1 })] });
  assert.deepEqual(out.entryUpdates, []);
  assert.deepEqual(out.state.queue, [{ eid: 'e1', pids: ['a', 'b'], ready: false }]);
});

test('with no participants loaded, no entry is cancelled', () => {
  const out = run({ ...S, participants: [], entries: [entry('e1', 'a', { at: 1 }), entry('e2', 'b', { at: 2 })] });
  assert.deepEqual(out.entryUpdates, []);
  assert.equal(out.state.queue.length, 2);
});

test('malformed entries (3 players, repeated pid) are cancelled without throwing', () => {
  const out = run({
    ...S, participants: players('a b c d e f g'),
    entries: [entry('bad3', 'a b c', { at: 1 }), entry('badrep', 'd d', { at: 2 }),
      entry('s1', 'e', { at: 3 }), entry('s2', 'f', { at: 4 }), entry('s3', 'g', { at: 5 }), entry('s4', 'a', { at: 6 })],
  });
  const cancelled = out.entryUpdates.filter((u) => u.status === 'cancelled').map((u) => u.eid);
  assert.deepEqual(cancelled, ['bad3', 'badrep']);
  assert.equal(out.newMatches.length, 1);
});

test('an unanswered invite does not lock the invitee out of their own solo stack', () => {
  const entries = [entry('inv', 'b a', { at: 1, accepted: 'b' }), entry('sa', 'a', { at: 2 }),
    entry('sc', 'c', { at: 3 }), entry('sd', 'd', { at: 4 }), entry('se', 'e', { at: 5 })];
  const out = run({ ...S, participants: players('a b c d e'), entries });
  assert.ok(!out.entryUpdates.some((u) => u.eid === 'sa' && u.status === 'cancelled'));
  assert.deepEqual([...out.newMatches[0].team1, ...out.newMatches[0].team2].sort(), ['a', 'c', 'd', 'e']);
  assert.deepEqual(out.state.queue, [{ eid: 'inv', pids: ['b', 'a'], ready: false }]);
});
