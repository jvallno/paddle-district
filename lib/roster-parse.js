// Paste-a-roster (v1 parity): turns a pasted list — often copied from a group
// chat — into player names. Pure — node-tested. Keeps v1's skip patterns
// (headers, dates, "Participants (12)", times, @mentions, bare numbers) and
// strips "1." numbering and invisible characters.

const SKIP = [
  /^pickleball/i, /^paddle district/i, /^(sun|mon|tue|wed|thu|fri|sat),/i,
  /^participants\s*\(/i, /^on hold\s*\(/i, /^\(\d+\)\s*$/, /^[a-z ]+\s*\(\d+\)\s*$/i,
  /^@/, /^\d+$/, /\d:\d{2}\s*(AM|PM)/i,
];
export const NAME_MAX = 40;

export function parseNames(raw) {
  return String(raw ?? '')
    .split('\n')
    .map((line) => line
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u00A0]/g, ' ')
      .trim()
      .replace(/^\d+\.\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX)
      .trim())
    .filter((l) => l.length >= 2 && !SKIP.some((p) => p.test(l)));
}

// Splits parsed names into the ones to add and the ones already in the session
// (or repeated in the paste), compared case-insensitively — v1's duplicate rule.
export function dedupeNames(names, existingNames = []) {
  const seen = new Set(existingNames.map((n) => n.toLowerCase()));
  const add = [];
  let skipped = 0;
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    add.push(name);
  }
  return { add, skipped };
}
