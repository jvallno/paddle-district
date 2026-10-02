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
