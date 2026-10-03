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
