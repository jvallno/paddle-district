import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash } from '../lib/router.js';

test('parseHash handles empty hash as the default route', () => {
  assert.deepEqual(parseHash(''), { name: 'home', param: null });
  assert.deepEqual(parseHash('#/'), { name: 'home', param: null });
});

test('parseHash honours a custom fallback route', () => {
  assert.deepEqual(parseHash('', 'queue'), { name: 'queue', param: null });
});

test('parseHash extracts route name', () => {
  assert.deepEqual(parseHash('#/courts'), { name: 'courts', param: null });
});

test('parseHash extracts a single param', () => {
  assert.deepEqual(parseHash('#/session/abc123'), { name: 'session', param: 'abc123' });
});
