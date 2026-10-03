// Session shapes and organizer actions as plain data (spec §13). Pure —
// node-tested. lib/sessions.js turns these into Firestore writes.
import { overrideScore } from './score-flow.js';

export const COURT_RULES = ['everyoneOff', 'winnersStay', 'winnersSplit'];
export const MAX_COURTS = 12;
export const SESSION_NAME_MAX = 60;
export const VENUE_MAX = 80;
export const COURT_NAME_MAX = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function defaultCourts(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}`, paused: false }));
}

// Create-session form → { ok, value, errors }. value is ready for newSessionDoc().
export function validateSessionInput({ name, date, venue, courts, ruleType, maxWins } = {}) {
  const errors = {};
  const n = clean(name);
  if (!n) errors.name = 'Give the session a name.';
  else if (n.length > SESSION_NAME_MAX) errors.name = `Keep it under ${SESSION_NAME_MAX} characters.`;
  const d = String(date ?? '');
  if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) errors.date = 'Pick a date.';
  const v = clean(venue);
  if (v.length > VENUE_MAX) errors.venue = `Keep it under ${VENUE_MAX} characters.`;
  const c = Number(courts);
  if (!Number.isInteger(c) || c < 1 || c > MAX_COURTS) errors.courts = `Between 1 and ${MAX_COURTS} courts.`;
  const type = COURT_RULES.includes(ruleType) ? ruleType : null;
  if (!type) errors.ruleType = 'Pick a court rule.';
  const w = Number(maxWins ?? 2);
  if (type && type !== 'everyoneOff' && (!Number.isInteger(w) || w < 1 || w > 5)) errors.maxWins = 'Between 1 and 5 wins.';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok ? { name: n, date: d, venue: v, courts: defaultCourts(c), courtRule: { type, maxWins: type === 'everyoneOff' ? 2 : w } } : null,
  };
}

// The sessions/{sid} doc (createdAt is added by the service as a server timestamp).
export function newSessionDoc(uid, value, now) {
  return {
    name: value.name,
    date: value.date,
    venue: value.venue,
    ownerId: uid,
    organizerIds: [uid],
    courts: value.courts,
    mode: 'fairness',
    courtRule: value.courtRule,
    guestsAllowed: true,
    status: 'live',
    host: null,
    shareQr: true,
    startedAt: now,
    endedAt: null,
  };
}

export function addCourt(courts) {
  if (courts.length >= MAX_COURTS) return courts;
  const next = Math.max(0, ...courts.map((c) => Number(c.id.slice(1)) || 0)) + 1;
  return [...courts, { id: `c${next}`, name: `Court ${next}`, paused: false }];
}

export function renameCourt(courts, id, name) {
  const n = clean(name).slice(0, COURT_NAME_MAX);
  if (!n) return courts;
  return courts.map((c) => (c.id === id ? { ...c, name: n } : c));
}

export function toggleCourtPaused(courts, id) {
  return courts.map((c) => (c.id === id ? { ...c, paused: !c.paused } : c));
}

// Deterministic match ids (carried forward from Plan 1): court id + sequence
// on that court, so two devices stepping the same state agree on the id.
export function nextMatchId({ courtId, prevMid }) {
  const prev = prevMid ? Number(String(prevMid).split('_').pop()) : 0;
  return `${courtId}_${(Number.isInteger(prev) ? prev : 0) + 1}`;
}

// Cancel match (v1 parity): no score; endedAt sends the four to the back of
// the line. fate 'hold' also puts them On hold.
export function cancelMatch(match, fate, now) {
  if (match.status !== 'playing') return { ok: false, error: 'not-playing' };
  const pids = [...match.team1, ...match.team2];
  return {
    ok: true,
    patch: { status: 'cancelled', endedAt: now, clientAt: now },
    hold: fate === 'hold' ? pids : [],
  };
}

// Swap one player on a live court for someone not on any court.
export function swapPlayer(match, outPid, inPid, inName, busyPids, now) {
  if (match.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (![...match.team1, ...match.team2].includes(outPid)) return { ok: false, error: 'not-in-match' };
  if (busyPids.has(inPid)) return { ok: false, error: 'busy' };
  const swap = (team) => team.map((p) => (p === outPid ? inPid : p));
  const names = { ...match.names, [inPid]: inName };
  delete names[outPid];
  return { ok: true, patch: { team1: swap(match.team1), team2: swap(match.team2), names, clientAt: now } };
}

// Organizer-entered score (3a) and "edit past score" — both are overrides.
// Cancelled matches can't be scored.
export function enterScore(match, uid, score, now) {
  if (match.status === 'cancelled') return { ok: false, error: 'cancelled' };
  return overrideScore(match, uid, score, now);
}

export function endSessionPatch(now) {
  return { status: 'ended', endedAt: now, host: null };
}

export function continueSessionPatch() {
  return { status: 'live', endedAt: null };
}

// My Sessions grouping: live (today or earlier) → upcoming → past.
// today is 'YYYY-MM-DD' in the device's local time.
export function groupSessions(sessions, today) {
  const live = [];
  const upcoming = [];
  const past = [];
  for (const s of sessions) {
    if (s.status === 'ended') past.push(s);
    else if (s.date > today) upcoming.push(s);
    else live.push(s);
  }
  const asc = (a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0);
  live.sort((a, b) => -asc(a, b));
  upcoming.sort(asc);
  past.sort((a, b) => -asc(a, b));
  return { live, upcoming, past };
}

// Local 'YYYY-MM-DD' for a Date (the create form's default date).
export function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
