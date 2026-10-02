import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, isValidHandle, suggestHandle } from '../lib/handle.js';

test('normalizeHandle trims, strips leading @ and lower-cases', () => {
  assert.equal(normalizeHandle('  @Maria_D '), 'maria_d');
  assert.equal(normalizeHandle('@@Ben'), 'ben');
  assert.equal(normalizeHandle(null), '');
});

test('isValidHandle accepts 3–20 of [a-z0-9_] only', () => {
  assert.equal(isValidHandle('ben'), true);
  assert.equal(isValidHandle('a_b_9'), true);
  assert.equal(isValidHandle('x'.repeat(20)), true);
  assert.equal(isValidHandle('ab'), false);
  assert.equal(isValidHandle('x'.repeat(21)), false);
  assert.equal(isValidHandle('Ben'), false, 'must be normalized first');
  assert.equal(isValidHandle('ben.d'), false);
  assert.equal(isValidHandle('bén'), false);
});

test('suggestHandle turns a display name into a valid handle', () => {
  assert.equal(suggestHandle('María Dela Cruz'), 'maria_dela_cruz');
  assert.equal(suggestHandle('  Ben  O\'Neil!! '), 'ben_o_neil');
  assert.equal(suggestHandle('Jo'), 'jo_player');
  assert.equal(suggestHandle('李'), 'player');
  assert.equal(suggestHandle(''), 'player');
  const long = suggestHandle('Alexandria Konstantinopoulou Smith');
  assert.ok(isValidHandle(long), long);
  assert.ok(!long.endsWith('_'));
});
