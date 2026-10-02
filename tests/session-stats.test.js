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
