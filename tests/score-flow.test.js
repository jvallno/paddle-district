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
