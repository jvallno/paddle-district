import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials, avatarIndex, avatarHtml, AVATAR_COLORS } from '../lib/avatar.js';

test('initials uses first and last word', () => {
  assert.equal(initials('Ana Dela Cruz'), 'AC');
  assert.equal(initials('  ben '), 'B');
  assert.equal(initials('élan vital'), 'ÉV');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
});

test('avatarIndex is stable and in range', () => {
  assert.equal(avatarIndex('ana'), avatarIndex('ana'));
  for (const k of ['a', 'ben', 'zz_top', '', null]) {
    const i = avatarIndex(k);
    assert.ok(Number.isInteger(i) && i >= 0 && i < AVATAR_COLORS, String(k));
  }
});

test('avatarHtml shows the photo when there is one', () => {
  const out = String(avatarHtml({ displayName: 'Ana', photoURL: 'https://x/a.png?s=1&t=2', uid: 'u1' }, { large: true }));
  assert.match(out, /^<span class="avatar avatar--c\d avatar--lg"><img src="https:\/\/x\/a\.png\?s=1&amp;t=2"/);
});

test('avatarHtml falls back to escaped initials', () => {
  assert.match(String(avatarHtml({ displayName: '<b>ob' })), />&lt;<\/span>$/);
  assert.match(String(avatarHtml(null)), />\?<\/span>$/);
});
