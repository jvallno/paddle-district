import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncStatus } from '../lib/sync-status.js';

test('sync status: saved → syncing while writes are pending → saved', async () => {
  const seen = [];
  const sync = createSyncStatus((s) => seen.push(s));
  let ok;
  const p = new Promise((r) => { ok = r; });
  sync.track(p);
  sync.track(Promise.reject(new Error('denied'))).catch(() => {});
  assert.equal(sync.state(), 'syncing');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sync.state(), 'syncing', 'one write still pending');
  ok();
  await p;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['saved', 'syncing', 'saved']);
});

test('sync status: offline wins until back online', () => {
  const seen = [];
  const sync = createSyncStatus((s) => seen.push(s), { online: false });
  sync.setOnline(true);
  assert.deepEqual(seen, ['offline', 'saved']);
});
