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
