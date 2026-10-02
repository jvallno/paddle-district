import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw } from '../lib/html.js';

test('html escapes interpolated strings', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<td>${name}</td>`), '<td>&lt;img src=x onerror=alert(1)&gt;</td>');
});

test('html escapes quotes so attribute values cannot break out', () => {
  const v = '" onmouseover="alert(1)';
  assert.equal(String(html`<a title="${v}">`), '<a title="&quot; onmouseover=&quot;alert(1)">');
});

test('html leaves the literal template markup untouched', () => {
  assert.equal(String(html`<p class="x">a &amp; b</p>`), '<p class="x">a &amp; b</p>');
});

test('html renders numbers, and null/undefined as empty', () => {
  assert.equal(String(html`${42}|${0}|${null}|${undefined}`), '42|0||');
});

test('booleans print like a plain template literal (attribute values keep working)', () => {
  assert.equal(String(html`<b data-on="${false}" aria-pressed="${true}">`), '<b data-on="false" aria-pressed="true">');
});

test('nested html fragments are not double-escaped', () => {
  const inner = html`<b>${'<i>'}</b>`;
  assert.equal(String(html`<p>${inner}</p>`), '<p><b>&lt;i&gt;</b></p>');
});

test('arrays are joined with no separator, each item escaped or kept if safe', () => {
  const rows = ['<a>', 'b'].map(x => html`<li>${x}</li>`);
  assert.equal(String(html`<ul>${rows}</ul>`), '<ul><li>&lt;a&gt;</li><li>b</li></ul>');
  assert.equal(String(html`${['<x>', 'y']}`), '&lt;x&gt;y');
});

test('raw() marks trusted markup to be inserted as-is', () => {
  assert.equal(String(html`<td>${raw('<span class="pill">In</span>')}</td>`), '<td><span class="pill">In</span></td>');
});

test('raw() coerces null/undefined to empty', () => {
  assert.equal(String(raw(null)), '');
});

test('result can be assigned where a string is expected', () => {
  const out = html`<p>${'hi'}</p>`;
  assert.equal(`${out}`, '<p>hi</p>');
  assert.equal(out + '', '<p>hi</p>');
});
