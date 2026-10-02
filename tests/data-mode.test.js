import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataMode, envBadge } from '../lib/data-mode.js';

test('production hosts always use live data, even with ?emulators', () => {
  assert.equal(dataMode('paddle-district-v2.web.app', ''), 'live');
  assert.equal(dataMode('paddle-district-v2.web.app', '?emulators'), 'live');
});

test('localhost uses live data by default', () => {
  assert.equal(dataMode('localhost', ''), 'live');
  assert.equal(dataMode('127.0.0.1', '?foo=1'), 'live');
});

test('localhost with ?emulators uses the sandbox', () => {
  assert.equal(dataMode('localhost', '?emulators'), 'emulators');
  assert.equal(dataMode('127.0.0.1', '?x=1&emulators=1'), 'emulators');
});

test('badge shows only on localhost and names the data', () => {
  assert.equal(envBadge('paddle-district-v2.web.app', 'live'), null);
  assert.deepEqual(envBadge('localhost', 'live'), { kind: 'live', label: 'LIVE DATA' });
  assert.deepEqual(envBadge('localhost', 'emulators'), { kind: 'sandbox', label: 'Sandbox · emulators' });
});
