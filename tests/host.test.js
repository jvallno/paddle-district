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
