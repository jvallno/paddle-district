import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_MAX, RATING_LEVELS, ratingOptions, levelFor, cleanName, validateProfileInput,
} from '../lib/profile-input.js';

test('ratingOptions is the half-point grid from 2 to 8', () => {
  const opts = ratingOptions();
  assert.equal(opts.length, 13);
  assert.equal(opts[0], 2);
  assert.equal(opts[1], 2.5);
  assert.equal(opts.at(-1), 8);
});

test('every rating option maps to exactly one level', () => {
  for (const r of ratingOptions()) {
    const hits = RATING_LEVELS.filter((l) => r >= l.min && r <= l.max);
    assert.equal(hits.length, 1, String(r));
  }
  assert.equal(levelFor(3.5).label, 'Recreational');
  assert.equal(levelFor(8).label, 'Elite');
  assert.equal(levelFor(1), null);
});

test('cleanName trims and collapses whitespace', () => {
  assert.equal(cleanName('  Ana   Reyes \n'), 'Ana Reyes');
  assert.equal(cleanName(null), '');
});

test('a valid setup form is normalized', () => {
  assert.deepEqual(validateProfileInput({ displayName: ' Ana  Reyes ', handle: '@Ana_R', selfRating: '3.5' }), {
    ok: true, value: { displayName: 'Ana Reyes', handle: 'ana_r', selfRating: 3.5 }, errors: {},
  });
});

test('each bad field gets its own message', () => {
  const r = validateProfileInput({ displayName: '   ', handle: 'a!', selfRating: 9 });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['displayName', 'handle', 'selfRating']);
  assert.match(r.errors.handle, /3–20/);
});

test('name length limit', () => {
  assert.equal(validateProfileInput({ displayName: 'x'.repeat(NAME_MAX) }).ok, true);
  assert.equal(validateProfileInput({ displayName: 'x'.repeat(NAME_MAX + 1) }).ok, false);
});

test('ratings must sit on the half-point grid within 2–8', () => {
  for (const ok of [2, 2.5, '4', 8]) assert.equal(validateProfileInput({ selfRating: ok }).ok, true, String(ok));
  for (const bad of [1.5, 3.3, 8.5, '', 'abc', null, undefined]) {
    assert.equal(validateProfileInput({ selfRating: bad }).ok, false, String(bad));
  }
});

test('only the fields passed are checked (edit screen omits handle)', () => {
  assert.deepEqual(validateProfileInput({ displayName: 'Ben', selfRating: 4 }), {
    ok: true, value: { displayName: 'Ben', selfRating: 4 }, errors: {},
  });
});
