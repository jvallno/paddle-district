import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNames, dedupeNames, NAME_MAX } from '../lib/roster-parse.js';

test('parseNames keeps one name per line and strips numbering', () => {
  assert.deepEqual(parseNames('1. Ana Cruz\n2.Ben\n  Carl  \n'), ['Ana Cruz', 'Ben', 'Carl']);
});

test('parseNames skips v1 chat-export noise', () => {
  const raw = [
    'Pickleball Open Play', 'Paddle District Saturday', 'Sat, Oct 4', 'Participants (12)',
    'On hold (2)', '(3)', 'Waitlist (4)', '@everyone', '12', '7:30 PM start', '', 'x', 'Dana',
  ].join('\n');
  assert.deepEqual(parseNames(raw), ['Dana']);
});

test('parseNames removes invisible and direction-control characters', () => {
  assert.deepEqual(parseNames('‮Eve​\nFe lix\n﻿'), ['Eve', 'Fe lix']);
});

test('parseNames caps names at NAME_MAX characters', () => {
  assert.equal(parseNames('x'.repeat(60))[0].length, NAME_MAX);
});

test('parseNames handles Windows line endings and empty input', () => {
  assert.deepEqual(parseNames('Ana\r\nBen\r\n'), ['Ana', 'Ben']);
  assert.deepEqual(parseNames(''), []);
  assert.deepEqual(parseNames(undefined), []);
});

test('dedupeNames skips names already in the session or repeated, ignoring case', () => {
  assert.deepEqual(dedupeNames(['Ana', 'ben', 'BEN', 'Carl'], ['ANA']), { add: ['ben', 'Carl'], skipped: 2 });
});
