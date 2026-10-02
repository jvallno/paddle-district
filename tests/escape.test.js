import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../lib/escape.js';

test('escapeHtml escapes HTML-significant characters', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('say "hi" it\'s'), 'say &quot;hi&quot; it&#39;s');
});

test('escapeHtml stringifies null/undefined/numbers safely', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});
