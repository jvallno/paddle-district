// Saved / syncing / offline indicator (spec §9, §13.7). Pure — node-tested.
// track(promise) for every fire-and-forget write; a write is "syncing" until
// the server acknowledges it (offline writes stay pending until reconnect).
//   const sync = createSyncStatus((s) => render(s));   s: 'saved' | 'syncing' | 'offline'
export function createSyncStatus(onChange, { online = true } = {}) {
  let pending = 0;
  let isOnline = online;
  let last = null;
  const state = () => (!isOnline ? 'offline' : pending > 0 ? 'syncing' : 'saved');
  const emit = () => { const s = state(); if (s !== last) { last = s; onChange(s); } };
  emit();
  return {
    track(promise) {
      pending += 1;
      emit();
      const settle = () => { pending -= 1; emit(); };
      promise.then(settle, settle);
      return promise;
    },
    setOnline(value) { isOnline = value; emit(); },
    state,
  };
}
