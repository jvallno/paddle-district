// Avatar helpers: initials + stable colors for players without a photo, and
// the avatar markup. Pure — node-tested.
import { html } from './html.js';

// "Ana Dela Cruz" → "AD"; "ben" → "B"; "" → "?"
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words.at(-1))[0] : '';
  return (first + last).toUpperCase();
}

// Stable index into the avatar palette (styles/tokens.css --avatar-0…5).
export const AVATAR_COLORS = 6;
export function avatarIndex(key) {
  let h = 0;
  for (const ch of String(key ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % AVATAR_COLORS;
}

// Avatar markup: the player's photo, or their initials on a stable color.
// person: { displayName, photoURL?, uid? }. Pure (html`` escapes everything).
export function avatarHtml(person, { large = false } = {}) {
  const name = person?.displayName ?? '';
  const cls = `avatar avatar--c${avatarIndex(person?.uid ?? name)}${large ? ' avatar--lg' : ''}`;
  if (person?.photoURL) {
    return html`<span class="${cls}"><img src="${person.photoURL}" alt="" referrerpolicy="no-referrer"></span>`;
  }
  return html`<span class="${cls}" aria-hidden="true">${initials(name)}</span>`;
}
