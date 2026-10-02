// Source-level guard for the html`` convention (see lib/html.js). Reads the UI
// files as text — nothing is imported, so DOM/Firebase modules are fine here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return jsFiles(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const FILES = [...jsFiles('features'), ...jsFiles('lib')].map((p) => [p, readFileSync(p, 'utf8')]);

test('no array is assigned straight to innerHTML (browser comma-joins it)', () => {
  // innerHTML = list.map(...)   or   innerHTML = cond ? list.map(...) : ...
  const ARRAY_SINK = /innerHTML\s*=\s*(?:[^;`]*?\?\s*)?[\w.]+\.map\(/g;
  const hits = FILES.flatMap(([p, src]) => [...src.matchAll(ARRAY_SINK)].map((m) => `${p}: ${m[0]}`));
  assert.deepEqual(hits, [], 'wrap it: el.innerHTML = html`${list.map(...)}`');
});

test('only lib/html.js imports escape.js — markup goes through html``', () => {
  const importers = FILES.filter(([, src]) => /from\s+['"][./]*(?:lib\/)?escape\.js['"]/.test(src)).map(([p]) => p);
  assert.deepEqual(importers, [join('lib', 'html.js')]);
});
