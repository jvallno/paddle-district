// Profile form rules (spec §4.1), shared by the setup and edit screens. Pure —
// node-tested. Mirrors firestore.rules → validProfile(); the rules are the
// real boundary, this gives friendly messages before a write is attempted.
import { normalizeHandle, isValidHandle } from './handle.js';

export const NAME_MAX = 40;
export const RATING_MIN = 2;
export const RATING_MAX = 8;
export const DEFAULT_SELF_RATING = 3;

// Self-rating guide shown next to the picker. Bands cover RATING_MIN–MAX.
export const RATING_LEVELS = [
  { min: 2, max: 2.5, label: 'New player', hint: 'Learning the rules, serves and basic strokes.' },
  { min: 3, max: 3.5, label: 'Recreational', hint: 'Keeps short rallies going; working on consistency and the kitchen.' },
  { min: 4, max: 4.5, label: 'Intermediate', hint: 'Steady dinks and drives, plays with a plan, few unforced errors.' },
  { min: 5, max: 5.5, label: 'Advanced', hint: 'Strong all-court game, controls pace, plays tournaments.' },
  { min: 6, max: 8, label: 'Elite', hint: 'Competes at the top level.' },
];

// 2, 2.5, 3 … 8
export function ratingOptions() {
  const out = [];
  for (let r = RATING_MIN; r <= RATING_MAX; r += 0.5) out.push(r);
  return out;
}

export function levelFor(rating) {
  return RATING_LEVELS.find((l) => rating >= l.min && rating <= l.max) ?? null;
}

export function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

// Returns { ok, value, errors }. `value` is normalized and ready to save;
// `errors` maps field → message. Pass only the fields the form edits
// (the edit screen omits `handle`, which can't change).
export function validateProfileInput(input) {
  const value = {};
  const errors = {};
  if ('displayName' in input) {
    value.displayName = cleanName(input.displayName);
    if (!value.displayName) errors.displayName = 'Enter your name.';
    else if (value.displayName.length > NAME_MAX) errors.displayName = `Keep it to ${NAME_MAX} characters.`;
  }
  if ('handle' in input) {
    value.handle = normalizeHandle(input.handle);
    if (!isValidHandle(value.handle)) errors.handle = '3–20 characters: lowercase letters, numbers or _.';
  }
  if ('selfRating' in input) {
    value.selfRating = Number(input.selfRating);
    const r = value.selfRating;
    if (!(r >= RATING_MIN && r <= RATING_MAX && Number.isInteger(r * 2))) {
      errors.selfRating = `Pick a level from ${RATING_MIN.toFixed(1)} to ${RATING_MAX.toFixed(1)}.`;
    }
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}
