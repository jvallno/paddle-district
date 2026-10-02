import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSession, setSession, onSession, statusForProfile } from '../lib/session.js';

test('session starts loading and merges patches, notifying listeners', () => {
  assert.equal(getSession().status, 'loading');
  const seen = [];
  const off = onSession((s) => seen.push(s.status));
  setSession({ status: 'signedOut' });
  setSession({ user: { uid: 'u' } });
  off();
  setSession({ status: 'ready' });
  assert.deepEqual(seen, ['signedOut', 'signedOut']);
  assert.equal(getSession().user.uid, 'u');
  assert.equal(getSession().status, 'ready');
});

test('statusForProfile: unconfirmed new profile is ignored until the server accepts it', () => {
  const p = { handle: 'ben' };
  assert.equal(statusForProfile('loading', null, false), 'needsProfile');
  assert.equal(statusForProfile('needsProfile', p, true), null, 'optimistic write ignored');
  assert.equal(statusForProfile('needsProfile', p, false), 'ready');
  assert.equal(statusForProfile('ready', p, true), 'ready', 'pending edits while ready are fine');
  assert.equal(statusForProfile('ready', null, false), 'needsProfile');
  assert.equal(statusForProfile('loading', p, false), 'ready');
});

test('statusForProfile: no profile from cache alone proves nothing (offline returning player)', () => {
  assert.equal(statusForProfile('loading', null, false, true), null, 'wait for server');
  assert.equal(statusForProfile('ready', null, false, true), null, 'wait for server');
  assert.equal(statusForProfile('loading', null, false, false), 'needsProfile', 'server says no profile');
});
