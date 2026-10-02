import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from '../lib/route-access.js';

test('nothing renders while auth is loading', () => {
  assert.deepEqual(resolveRoute('loading', 'home'), { wait: true });
});

test('signed out: only the sign-in screen; other routes are remembered', () => {
  assert.deepEqual(resolveRoute('signedOut', 'signin'), { show: 'signin' });
  assert.deepEqual(resolveRoute('signedOut', 'u'), { redirect: 'signin', remember: true });
  assert.deepEqual(resolveRoute('signedOut', 'setup'), { redirect: 'signin', remember: false });
});

test('signed in without a profile: only setup', () => {
  assert.deepEqual(resolveRoute('needsProfile', 'setup'), { show: 'setup' });
  assert.deepEqual(resolveRoute('needsProfile', 'me'), { redirect: 'setup', remember: true });
  assert.deepEqual(resolveRoute('needsProfile', 'signin'), { redirect: 'setup', remember: false });
});

test('ready: auth screens bounce to home (or the remembered route)', () => {
  assert.deepEqual(resolveRoute('ready', 'signin'), { redirect: 'home', resume: true });
  assert.deepEqual(resolveRoute('ready', 'setup'), { redirect: 'home', resume: true });
  assert.deepEqual(resolveRoute('ready', 'me'), { show: 'me' });
  assert.deepEqual(resolveRoute('ready', 'u'), { show: 'u' });
});

test('unknown status: render nothing rather than fail open', () => {
  assert.deepEqual(resolveRoute('weird', 'home'), { wait: true });
});
