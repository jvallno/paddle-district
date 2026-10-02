import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTheme, nextTheme, toggleLabel, THEMES, THEME_KEY } from '../lib/theme-choice.js';

test('a saved theme wins over the device setting', () => {
  assert.equal(initialTheme('light', true), 'light');
  assert.equal(initialTheme('dark', false), 'dark');
});

test('without a valid saved theme, follow the device', () => {
  assert.equal(initialTheme(null, true), 'dark');
  assert.equal(initialTheme(undefined, false), 'light');
  assert.equal(initialTheme('purple', true), 'dark');
});

test('nextTheme flips between the two themes', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('weird'), 'dark');
});

test('the toggle offers the other theme', () => {
  assert.deepEqual(toggleLabel('light'), { icon: '🌙', label: 'Switch to dark theme' });
  assert.deepEqual(toggleLabel('dark'), { icon: '☀️', label: 'Switch to light theme' });
});

test('constants', () => {
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.equal(THEME_KEY, 'pd:theme');
});
