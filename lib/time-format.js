// Clock strings for timers. Pure — node-tested.

const pad = (n) => String(n).padStart(2, '0');

// Session clock (v1): 'HH:MM:SS'. Negative or missing → '00:00:00'.
export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Court / game timer: 'M:SS', or 'H:MM:SS' past an hour.
export function formatClock(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
