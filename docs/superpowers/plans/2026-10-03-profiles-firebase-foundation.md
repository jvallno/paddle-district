# Profiles & Firebase Foundation Implementation Plan (Spec 1 · Plan 2 of 3)

> **Renamed 2026-10-03:** the product is now **Paddle District** (v2); "Pickle Boat" was the working title. Code snippets below predate the rename — the code in the repo is authoritative.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players sign in with Google, set up a profile (name, unique @handle, self-rating), see their QR player card, and open other players' public profiles. Firestore security rules protect all of it and are proven by an emulator test suite.

**Architecture:** On localhost the app talks to the Firebase **emulators** with a `demo-` project, so the whole plan is built and verified with no cloud project. Pure logic (form checks, which screens each auth state may see, avatars, session state) lives in node-tested `lib/` modules. `lib/app.js` follows auth plus the player's profile and routes through `resolveRoute()`. The real Firebase project is created only in the last task, and only on the user's explicit go-ahead.

**Tech Stack:** Vanilla JS ES modules (no build); Firebase JS SDK **12.19.0** from gstatic; `qrcode-generator@2.0.4` from jsDelivr; `node --test`; rules tests with `@firebase/rules-unit-testing` 5.0.2 + `firebase-tools` 15.32.1 (test-only, in `rules-tests/`); Java 21 for the emulators.

**Spec:** `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md` (§2, §4.1, §6, §7, §8, §9, §12)

**Builds on:** Plan 1 (`lib/handle.js`). Branch `feat/profiles` is stacked on `feat/core-game-logic` (PR #1).

## Global Constraints

- Vanilla JS ES modules, **no build step**; no package dependencies for the app. Test/dev tooling only in `rules-tests/` with its own `package.json` (AGENTS.md).
- Every Firebase import pins **12.19.0** (`https://www.gstatic.com/firebasejs/12.19.0/…`).
- Render with the `html` tag; `raw()` only for trusted generated markup (the QR SVG). `tests/html-usage.test.js` must stay green.
- Colors, spacing and radii only from `styles/tokens.css` variables. Brand palette (spec §7): `#273635 #384d3e #4e5650 #577047 #5d814c`, accent `#c9d64a`.
- Verified = signed in with **Google**. No phone, club or rating badges yet, and the rules must **deny** any `badges` field.
- Rules match users by Auth **uid** only, never `email_verified`.
- `@handle`: `[a-z0-9_]{3,20}`, unique, fixed after creation. `selfRating`: 2.0–8.0 in 0.5 steps. `displayName`: 1–40 characters after trimming.
- `lib/firebase-config.js` stays gitignored. Local development never touches production (localhost → emulators, `demo-pickle-boat`).
- Commits: one per task, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **No push, no deploy** except Task 5, which needs the user's explicit go-ahead.

## Review Focus

Inputs the spec implies but doesn't spell out, most likely to bite first. Each is pinned in the task named:

1. **A handle taken by someone else between the availability check and submit.** Firestore applies the batch locally, the rules reject it, and the app must stay on setup with the form intact and a "was just taken" message, not bounce away and back. → Task 1 `statusForProfile` test + Task 3 browser check B5.
2. **Opening a player-card QR link while signed out** must land on that profile after sign-in. An **explicit sign-out** must not send the next person on the device to the previous player's page. → Task 1 `resolveRoute` tests + Task 3 checks B2, B8.
3. **A player writing extra fields** (`badges`, a new handle, an edited `createdAt`) must be denied by the rules. → Task 2 attack tests.
4. **Odd profile links:** an uppercase handle opens the profile; a malformed one says "This isn't a valid player link". → Task 3 check B7.
5. **Closing the Google popup** must not show an error toast. → Task 3 check B3.

## Spec deltas this plan introduces (recorded in Task 4)

- `@handle` is **fixed after creation** (rules deny changing it). §4.1 didn't say.
- The profile photo is the Google account photo (`photoURL`); there is no upload yet.
- First-time profile setup needs a connection (the batch is awaited). Later edits are offline-tolerant.
- A new player's unconfirmed local profile write doesn't count until the server confirms it (`statusForProfile`).
- On localhost the app always uses the emulators (`demo-pickle-boat`). `lib/firebase-config.js` is only needed off localhost.
- Rules enforce Google as the sign-in provider (`sign_in_provider == 'google.com'`), not just the UI (review fix).
- Profiles: `displayName` must contain a non-space; `photoURL` must be empty or https (rules), and avatars only render https photos (review fix).
- A cache-only "no profile" snapshot doesn't count (`statusForProfile(…, fromCache)`), so an offline returning player isn't sent to setup; a stalled load shows a recovery screen (review fix).
- Final review: production boot fallback + predeploy config check + no-cache headers; users listing capped at 25; Google-hosted photos only; invisible/bidi characters rejected in names.

## File structure

| File | Responsibility |
|---|---|
| `lib/profile-input.js` | Profile form rules + rating levels (pure) |
| `lib/route-access.js` | Which screen each auth status may see (pure) |
| `lib/avatar.js` | Initials, stable colors, avatar markup (pure) |
| `lib/session.js` | Shared session state + `statusForProfile` (pure) |
| `firestore.rules`, `firebase.json`, `firestore.indexes.json` | Security rules, hosting and emulator config |
| `rules-tests/` | Emulator rules suite + `npm run emulators` tooling (own `package.json`) |
| `lib/firebase.js`, `lib/auth.js`, `lib/profiles.js`, `lib/qr.js` | Firebase init (emulators on localhost), Google sign-in, profile reads/writes, QR SVG |
| `lib/app.js` | Auth/profile watcher → session → guarded router |
| `features/{topbar,signin,setup,home,me,profile,shared}` | Screens + styles |
| `styles/tokens.css`, `styles/base.css`, `index.html` | Brand tokens, shared form/card/avatar styles, page shell |

---

### Task 1: Pure profile & routing logic

**Files:**
- Create: `lib/profile-input.js`, `lib/route-access.js`, `lib/avatar.js`, `lib/session.js`
- Test: `tests/profile-input.test.js`, `tests/route-access.test.js`, `tests/avatar.test.js`, `tests/session.test.js`

**Interfaces:**
- Consumes: `normalizeHandle`, `isValidHandle` from `lib/handle.js` (Plan 1); `html` from `lib/html.js`.
- Produces:
  - `NAME_MAX = 40`, `RATING_MIN = 2`, `RATING_MAX = 8`, `DEFAULT_SELF_RATING = 3`, `RATING_LEVELS`, `ratingOptions()`, `levelFor(r)`, `cleanName(s)`
  - `validateProfileInput({displayName?, handle?, selfRating?}) → { ok, value, errors }`
  - `PUBLIC_ROUTES`, `resolveRoute(status, name) → { show } | { redirect, remember?, resume? } | { wait: true }`
  - `initials(name)`, `AVATAR_COLORS = 6`, `avatarIndex(key)`, `avatarHtml(person, { large })`
  - `getSession()`, `setSession(patch)`, `onSession(fn) → unsubscribe`, `statusForProfile(status, profile, pending) → status | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/profile-input.test.js`:

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_MAX, RATING_LEVELS, ratingOptions, levelFor, cleanName, validateProfileInput,
} from '../lib/profile-input.js';

test('ratingOptions is the half-point grid from 2 to 8', () => {
  const opts = ratingOptions();
  assert.equal(opts.length, 13);
  assert.equal(opts[0], 2);
  assert.equal(opts[1], 2.5);
  assert.equal(opts.at(-1), 8);
});

test('every rating option maps to exactly one level', () => {
  for (const r of ratingOptions()) {
    const hits = RATING_LEVELS.filter((l) => r >= l.min && r <= l.max);
    assert.equal(hits.length, 1, String(r));
  }
  assert.equal(levelFor(3.5).label, 'Recreational');
  assert.equal(levelFor(8).label, 'Elite');
  assert.equal(levelFor(1), null);
});

test('cleanName trims and collapses whitespace', () => {
  assert.equal(cleanName('  Ana   Reyes \n'), 'Ana Reyes');
  assert.equal(cleanName(null), '');
});

test('a valid setup form is normalized', () => {
  assert.deepEqual(validateProfileInput({ displayName: ' Ana  Reyes ', handle: '@Ana_R', selfRating: '3.5' }), {
    ok: true, value: { displayName: 'Ana Reyes', handle: 'ana_r', selfRating: 3.5 }, errors: {},
  });
});

test('each bad field gets its own message', () => {
  const r = validateProfileInput({ displayName: '   ', handle: 'a!', selfRating: 9 });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['displayName', 'handle', 'selfRating']);
  assert.match(r.errors.handle, /3–20/);
});

test('name length limit', () => {
  assert.equal(validateProfileInput({ displayName: 'x'.repeat(NAME_MAX) }).ok, true);
  assert.equal(validateProfileInput({ displayName: 'x'.repeat(NAME_MAX + 1) }).ok, false);
});

test('ratings must sit on the half-point grid within 2–8', () => {
  for (const ok of [2, 2.5, '4', 8]) assert.equal(validateProfileInput({ selfRating: ok }).ok, true, String(ok));
  for (const bad of [1.5, 3.3, 8.5, '', 'abc', null, undefined]) {
    assert.equal(validateProfileInput({ selfRating: bad }).ok, false, String(bad));
  }
});

test('only the fields passed are checked (edit screen omits handle)', () => {
  assert.deepEqual(validateProfileInput({ displayName: 'Ben', selfRating: 4 }), {
    ok: true, value: { displayName: 'Ben', selfRating: 4 }, errors: {},
  });
});
````

Create `tests/route-access.test.js`:

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from '../lib/route-access.js';

test('nothing renders while auth is loading', () => {
  assert.deepEqual(resolveRoute('loading', 'home'), { wait: true });
});

test('signed out: only the sign-in screen; other routes are remembered', () => {
  assert.deepEqual(resolveRoute('signedOut', 'signin'), { show: 'signin' });
  assert.deepEqual(resolveRoute('signedOut', 'u'), { redirect: 'signin', remember: true });
  assert.deepEqual(resolveRoute('signedOut', 'setup'), { redirect: 'signin', remember: false });
});

test('signed in without a profile: only setup', () => {
  assert.deepEqual(resolveRoute('needsProfile', 'setup'), { show: 'setup' });
  assert.deepEqual(resolveRoute('needsProfile', 'me'), { redirect: 'setup', remember: true });
  assert.deepEqual(resolveRoute('needsProfile', 'signin'), { redirect: 'setup', remember: false });
});

test('ready: auth screens bounce to home (or the remembered route)', () => {
  assert.deepEqual(resolveRoute('ready', 'signin'), { redirect: 'home', resume: true });
  assert.deepEqual(resolveRoute('ready', 'setup'), { redirect: 'home', resume: true });
  assert.deepEqual(resolveRoute('ready', 'me'), { show: 'me' });
  assert.deepEqual(resolveRoute('ready', 'u'), { show: 'u' });
});
````

Create `tests/avatar.test.js`:

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials, avatarIndex, avatarHtml, AVATAR_COLORS } from '../lib/avatar.js';

test('initials uses first and last word', () => {
  assert.equal(initials('Ana Dela Cruz'), 'AC');
  assert.equal(initials('  ben '), 'B');
  assert.equal(initials('élan vital'), 'ÉV');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
});

test('avatarIndex is stable and in range', () => {
  assert.equal(avatarIndex('ana'), avatarIndex('ana'));
  for (const k of ['a', 'ben', 'zz_top', '', null]) {
    const i = avatarIndex(k);
    assert.ok(Number.isInteger(i) && i >= 0 && i < AVATAR_COLORS, String(k));
  }
});

test('avatarHtml shows the photo when there is one', () => {
  const out = String(avatarHtml({ displayName: 'Ana', photoURL: 'https://x/a.png?s=1&t=2', uid: 'u1' }, { large: true }));
  assert.match(out, /^<span class="avatar avatar--c\d avatar--lg"><img src="https:\/\/x\/a\.png\?s=1&amp;t=2"/);
});

test('avatarHtml falls back to escaped initials', () => {
  assert.match(String(avatarHtml({ displayName: '<b>ob' })), />&lt;<\/span>$/);
  assert.match(String(avatarHtml(null)), />\?<\/span>$/);
});
````

Create `tests/session.test.js`:

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSession, setSession, onSession, statusForProfile } from '../lib/session.js';

test('session starts loading and merges patches, notifying listeners', () => {
  assert.equal(getSession().status, 'loading');
  const seen = [];
  const off = onSession((s) => seen.push(s.status));
  setSession({ status: 'signedOut' });
  setSession({ user: { uid: 'u' } });
  off();
  setSession({ status: 'ready' });
  assert.deepEqual(seen, ['signedOut', 'signedOut']);
  assert.equal(getSession().user.uid, 'u');
  assert.equal(getSession().status, 'ready');
});

test('statusForProfile: unconfirmed new profile is ignored until the server accepts it', () => {
  const p = { handle: 'ben' };
  assert.equal(statusForProfile('loading', null, false), 'needsProfile');
  assert.equal(statusForProfile('needsProfile', p, true), null, 'optimistic write ignored');
  assert.equal(statusForProfile('needsProfile', p, false), 'ready');
  assert.equal(statusForProfile('ready', p, true), 'ready', 'pending edits while ready are fine');
  assert.equal(statusForProfile('ready', null, false), 'needsProfile');
  assert.equal(statusForProfile('loading', p, false), 'ready');
});
````

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test tests/profile-input.test.js tests/route-access.test.js tests/avatar.test.js tests/session.test.js`
Expected: FAIL — `Cannot find module` for each new lib file.

- [ ] **Step 3: Implement**

Create `lib/profile-input.js`:

````js
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
````

Create `lib/route-access.js`:

````js
// Which screen each auth state may see (spec §6). Pure — node-tested; the app
// shell (lib/app.js) applies the answer.
//
// status: 'loading' | 'signedOut' | 'needsProfile' | 'ready'
// Returns { show: routeName } to render, { redirect: routeName } to change
// the hash, or { wait: true } while auth is still loading. `remember: true`
// on a redirect means "come back to the requested route after signing in".

// Routes anyone may open without an account (Plan 3 adds 'tv').
export const PUBLIC_ROUTES = new Set([]);
const AUTH_ROUTES = new Set(['signin', 'setup']);

export function resolveRoute(status, name) {
  if (PUBLIC_ROUTES.has(name)) return { show: name };
  if (status === 'loading') return { wait: true };
  if (status === 'signedOut') {
    return name === 'signin' ? { show: 'signin' } : { redirect: 'signin', remember: !AUTH_ROUTES.has(name) };
  }
  if (status === 'needsProfile') {
    return name === 'setup' ? { show: 'setup' } : { redirect: 'setup', remember: !AUTH_ROUTES.has(name) };
  }
  if (AUTH_ROUTES.has(name)) return { redirect: 'home', resume: true };
  return { show: name };
}
````

Create `lib/avatar.js`:

````js
// Avatar helpers: initials + stable colors for players without a photo, and
// the avatar markup. Pure — node-tested.
import { html } from './html.js';

// "Ana Dela Cruz" → "AD"; "ben" → "B"; "" → "?"
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words.at(-1)[0] : '';
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
````

Create `lib/session.js`:

````js
// The signed-in player's session, shared by the app shell and features. Pure
// (no DOM/Firebase) — lib/app.js feeds it from Firebase.
//   status: 'loading' | 'signedOut' | 'needsProfile' | 'ready'
//   user:   Firebase Auth user or null;  profile: users/{uid} data or null
let state = { status: 'loading', user: null, profile: null };
const listeners = new Set();

export function getSession() {
  return state;
}

export function setSession(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

// fn(state) after every change. Returns unsubscribe.
export function onSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Session status after a profile snapshot, or null to ignore the snapshot.
// A profile that exists only as an unconfirmed local write (pending) doesn't
// make a new player 'ready': if the rules reject it (e.g. the handle was
// taken) the app would bounce away from setup and back, wiping the form.
// Once ready, pending edits are normal (offline-tolerant profile edits).
export function statusForProfile(currentStatus, profile, pending) {
  if (profile && pending && currentStatus !== 'ready') return null;
  return profile ? 'ready' : 'needsProfile';
}
````

- [ ] **Step 4: Run the tests and verify they pass**

Run: the same command. Expected: PASS. Then `npm test`: the whole suite passes (118 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/profile-input.js lib/route-access.js lib/avatar.js lib/session.js tests/profile-input.test.js tests/route-access.test.js tests/avatar.test.js tests/session.test.js
git commit -m "feat(lib): profile form rules, route access, avatars, session state"
```

### Task 2: Security rules + emulator test suite

**Files:**
- Create: `firestore.rules`, `firebase.json`, `firestore.indexes.json`, `rules-tests/package.json`, `rules-tests/firebase.json`, `rules-tests/with-java.sh`, `rules-tests/firestore-rules.spec.mjs`, `rules-tests/package-lock.json` (generated)
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `npm run test:rules`: the emulator rules suite.
  - `npm run emulators`: auth on 9099 and Firestore on 8080, project `demo-pickle-boat` (Task 3's browser checks use it).
  - Data contract: `users/{uid}` = `{ displayName, handle, photoURL, selfRating, createdAt }`, created only in the same batch as `handles/{handle}` = `{ uid }`.

- [ ] **Step 0: Make sure Java 21+ is available (emulator prerequisite)**

Run: `java -version || ls ~/.local/jdk`
If neither works, install a user-space JDK (no admin rights, no Homebrew needed):

```bash
T=$(mktemp -d) && curl -fsSL -o $T/jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse" \
  && mkdir -p ~/.local/jdk && tar -xzf $T/jdk.tar.gz -C ~/.local/jdk && ls ~/.local/jdk
```

(`rules-tests/with-java.sh` finds it automatically.)

- [ ] **Step 1: Write the failing rules tests and the tooling**

Create `rules-tests/firestore-rules.spec.mjs`:

````js
// Firestore security-rules tests — run against the local emulator, never the
// live project. Every rules change keeps all "attack" cases denied and all
// "normal use" cases allowed.
//   npm run test:rules            (from the repo root; needs Java 21+)
// Named *.spec.mjs so the root `npm test` (pure unit tests) doesn't pick it up.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
  writeBatch, serverTimestamp,
} from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});
after(async () => { await env.cleanup(); });

// ana already has a profile; ben is signed in but hasn't set one up yet.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users/ana'), { displayName: 'Ana', handle: 'ana', photoURL: '', selfRating: 3.5, createdAt: new Date(0) });
    await setDoc(doc(db, 'handles/ana'), { uid: 'ana' });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const profile = (over = {}) => ({ displayName: 'Ben', handle: 'ben', photoURL: '', selfRating: 3, createdAt: serverTimestamp(), ...over });

// Profile setup = one batch: claim the handle + create the profile.
function setup(db, uid, data = profile(), handle = data.handle, claimUid = uid) {
  const b = writeBatch(db);
  b.set(doc(db, `handles/${handle}`), { uid: claimUid });
  b.set(doc(db, `users/${uid}`), data);
  return b.commit();
}

// ── Attacks: must all be DENIED ─────────────────────────────────────────────
test('attack: read profiles signed out', async () => {
  await assertFails(getDoc(doc(anon(), 'users/ana')));
});
test('attack: look up a handle signed out', async () => {
  await assertFails(getDoc(doc(anon(), 'handles/ana')));
});
test('attack: list all handles', async () => {
  await assertFails(getDocs(collection(as('ben'), 'handles')));
});
test('attack: create a profile for someone else', async () => {
  await assertFails(setup(as('ben'), 'carl', profile({ handle: 'carl' })));
});
test('attack: create a profile without claiming the handle', async () => {
  await assertFails(setDoc(doc(as('ben'), 'users/ben'), profile()));
});
test('attack: claim a handle without creating the profile', async () => {
  await assertFails(setDoc(doc(as('ben'), 'handles/ben'), { uid: 'ben' }));
});
test("attack: take someone else's handle", async () => {
  await assertFails(setup(as('ben'), 'ben', profile({ handle: 'ana' })));
});
test('attack: claim a handle pointing at another account', async () => {
  await assertFails(setup(as('ben'), 'ben', profile(), 'ben', 'ana'));
});
test('attack: claim a second handle after setup', async () => {
  await assertFails(setDoc(doc(as('ana'), 'handles/ana2'), { uid: 'ana' }));
});
test('attack: change your own handle', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { handle: 'queen' }));
});
test("attack: edit someone else's profile", async () => {
  await assertFails(updateDoc(doc(as('ben'), 'users/ana'), { displayName: 'Hacked' }));
});
test('attack: self-award a badge', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { badges: { rating: true } }));
});
test('attack: invalid fields on setup', async () => {
  for (const bad of [
    { selfRating: 9 }, { selfRating: 1.5 }, { selfRating: 3.3 }, { selfRating: '3' },
    { displayName: '' }, { displayName: 'x'.repeat(41) }, { handle: 'Ben', displayName: 'Ben' },
    { createdAt: new Date(0) },
  ]) {
    const data = profile(bad);
    await assertFails(setup(as('ben'), 'ben', data, data.handle), JSON.stringify(bad));
  }
});
test('attack: invalid rating on update', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { selfRating: 8.5 }));
});
test('attack: rewrite createdAt', async () => {
  await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { createdAt: new Date(5) }));
});
test('attack: delete a profile or free a handle', async () => {
  await assertFails(deleteDoc(doc(as('ana'), 'users/ana')));
  await assertFails(deleteDoc(doc(as('ana'), 'handles/ana')));
});
test('attack: repoint a handle', async () => {
  await assertFails(setDoc(doc(as('ana'), 'handles/ana'), { uid: 'ben' }));
});
test('attack: anything outside users/handles', async () => {
  await assertFails(setDoc(doc(as('ana'), 'sessions/s1'), { ownerId: 'ana' }));
  await assertFails(getDoc(doc(as('ana'), 'results/r1')));
});

// ── Normal use: must all be ALLOWED ─────────────────────────────────────────
test('new player sets up a profile and claims a handle', async () => {
  await assertSucceeds(setup(as('ben'), 'ben'));
});
test('ratings on the half-point grid from 2 to 8 are accepted', async () => {
  await assertSucceeds(setup(as('ben'), 'ben', profile({ selfRating: 2 })));
  for (const r of [2.5, 4, 7.5, 8]) await assertSucceeds(updateDoc(doc(as('ben'), 'users/ben'), { selfRating: r }));
});
test('player edits name, photo and rating', async () => {
  await assertSucceeds(updateDoc(doc(as('ana'), 'users/ana'), { displayName: 'Ana R.', photoURL: 'https://x/p.png', selfRating: 4 }));
});
test('signed-in player reads profiles and looks up a handle', async () => {
  await assertSucceeds(getDoc(doc(as('ben'), 'users/ana')));
  await assertSucceeds(getDoc(doc(as('ben'), 'handles/ana')));
  await assertSucceeds(getDoc(doc(as('ben'), 'handles/nobody')));
});
test('signed-in player can query profiles by handle', async () => {
  await assertSucceeds(getDocs(query(collection(as('ben'), 'users'), where('handle', '==', 'ana'))));
});
````

Create `rules-tests/package.json`:

````json
{
  "name": "pickle-boat-rules-tests",
  "private": true,
  "type": "module",
  "description": "Firestore security-rules tests + local emulators. Separate from the app so the app stays zero-dependency.",
  "scripts": {
    "test": "./with-java.sh firebase emulators:exec --only firestore --project demo-rules \"node --test firestore-rules.spec.mjs\"",
    "emulators": "./with-java.sh firebase emulators:start --only auth,firestore --project demo-pickle-boat --config ../firebase.json"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "5.0.2",
    "firebase": "12.19.0",
    "firebase-tools": "15.32.1"
  }
}
````

Create `rules-tests/firebase.json`:

````json
{
  "emulators": { "firestore": { "port": 8089 }, "ui": { "enabled": false } }
}
````

Create `rules-tests/with-java.sh`:

````sh
#!/bin/sh
# The Firebase emulators need Java 21+. Use the one on PATH, else the user-space
# JDK at ~/.local/jdk (see AGENTS.md → Run / test), then run the given command.
if ! java -version >/dev/null 2>&1; then
  for home in "$HOME"/.local/jdk/*/Contents/Home "$HOME"/.local/jdk/*; do
    if [ -x "$home/bin/java" ]; then
      JAVA_HOME="$home"; PATH="$home/bin:$PATH"; export JAVA_HOME PATH; break
    fi
  done
fi
exec npx "$@"
````

Replace the whole file `package.json`:

````json
{
  "name": "pickle-boat",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "test:rules": "npm --prefix rules-tests test",
    "emulators": "npm --prefix rules-tests run emulators",
    "serve": "python3 serve.py 5174"
  }
}
````

Make the wrapper executable and install the test tooling:

```bash
chmod +x rules-tests/with-java.sh
npm --prefix rules-tests install --no-audit --no-fund
```

- [ ] **Step 2: Run the rules tests and verify they fail**

Run: `npm run test:rules`
Expected: FAIL. There is no `firestore.rules` yet, so the `readFileSync` in the suite's `before()` throws ENOENT.

- [ ] **Step 3: Write the rules and Firebase config**

Create `firestore.rules`:

````txt
rules_version = '2';

// Pickle Boat security rules — the real security boundary (UI checks are
// cosmetic). Every change here needs rules-tests/ updated: attacks denied,
// normal flows allowed. Users are matched by Auth uid only, never email.
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isSelf(uid) { return signedIn() && request.auth.uid == uid; }

    // Public profile (spec §4.1). Badge fields are deliberately not allowed:
    // they arrive with the "Pro" stage and are never self-written.
    function validProfile(d) {
      return d.keys().hasOnly(['displayName', 'handle', 'photoURL', 'selfRating', 'createdAt'])
        && d.keys().hasAll(['displayName', 'handle', 'photoURL', 'selfRating', 'createdAt'])
        && d.displayName is string && d.displayName.size() >= 1 && d.displayName.size() <= 40
        && d.handle is string && d.handle.matches('^[a-z0-9_]{3,20}$')
        && d.photoURL is string && d.photoURL.size() <= 1000
        && (d.selfRating is int || d.selfRating is float)
        && d.selfRating >= 2 && d.selfRating <= 8
        && d.selfRating * 2 == math.floor(d.selfRating * 2);
    }

    match /users/{uid} {
      allow read: if signedIn();
      // Created once, in the same batch that claims handles/{handle}.
      allow create: if isSelf(uid)
        && validProfile(request.resource.data)
        && request.resource.data.createdAt == request.time
        && getAfter(/databases/$(database)/documents/handles/$(request.resource.data.handle)).data.uid == uid;
      // Handle and createdAt are fixed after creation.
      allow update: if isSelf(uid)
        && validProfile(request.resource.data)
        && request.resource.data.handle == resource.data.handle
        && request.resource.data.createdAt == resource.data.createdAt;
      allow delete: if false;
    }

    // handles/{handle} → { uid }: makes @handles unique. Claimable only while
    // creating your profile (so one handle per account); never moved or freed.
    match /handles/{handle} {
      allow get: if signedIn();
      allow list: if false;
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['uid'])
        && request.resource.data.uid == request.auth.uid
        && handle.matches('^[a-z0-9_]{3,20}$')
        && !exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.handle == handle;
      allow update, delete: if false;
    }
  }
}
````

Create `firebase.json`:

````json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**",
      ".git/**",
      ".claude/**",
      ".superpowers/**",
      ".playwright-mcp/**",
      "docs/**",
      "tests/**",
      "rules-tests/**",
      "serve.py",
      "package.json",
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      "firestore.rules",
      "firestore.indexes.json",
      "lib/firebase-config.example.js"
    ]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
````

Create `firestore.indexes.json`:

````json
{
  "indexes": [],
  "fieldOverrides": []
}
````

- [ ] **Step 4: Run the rules tests and verify they pass**

Run: `npm run test:rules`
Expected: `ℹ tests 23`, `ℹ pass 23`, `ℹ fail 0`. The suite prints `PERMISSION_DENIED` log lines for the attack cases; those are expected.
Also run `npm test`: the unit suite still passes, and it must **not** pick up `rules-tests/` (`*.spec.mjs` isn't in node's default test patterns).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firebase.json firestore.indexes.json rules-tests/package.json rules-tests/package-lock.json rules-tests/firebase.json rules-tests/with-java.sh rules-tests/firestore-rules.spec.mjs package.json
git commit -m "feat(rules): profile + handle security rules with emulator test suite"
```

### Task 3: Firebase services, app shell and profile screens

**Files:**
- Create: `lib/firebase.js`, `lib/auth.js`, `lib/profiles.js`, `lib/qr.js`, `features/shared/rating-field.js`, `features/topbar/topbar.{js,css}`, `features/signin/signin.{js,css}`, `features/setup/setup.{js,css}`, `features/me/me.{js,css}`, `features/profile/profile.{js,css}`
- Modify (full replacements below): `styles/tokens.css`, `styles/base.css`, `index.html`, `lib/firebase-config.example.js`, `lib/app.js`, `features/home/home.js`, `features/home/home.css`

**Interfaces:**
- Consumes: everything from Task 1; `suggestHandle`, `normalizeHandle`, `isValidHandle` (Plan 1); emulators from Task 2.
- Produces (Plan 3 builds on these):
  - `auth`, `db`, `isLocal` from `lib/firebase.js`
  - `watchAuth(cb)`, `signInWithGoogle()`, `signOut()` from `lib/auth.js`
  - `watchProfile(uid, cb(profile, err, { pending }))`, `isHandleTaken(h)`, `createProfile(uid, data)` (throws `Error('handle-taken')`), `updateProfile(uid, fields)`, `findByHandle(h)` from `lib/profiles.js`
  - `qrSvg(text)` from `lib/qr.js`; `profileUrl(handle)` from `features/me/me.js`
  - Routes: `signin`, `setup`, `home`, `me`, `u/{handle}`
  - CSS classes `.page`, `.card`, `.field`, `.input`, `.avatar`, `.pill`

UI code has no node tests beyond `tests/html-usage.test.js`. It is verified in a real browser against the emulators (Step 4).

- [ ] **Step 1: Styles and page shell**

Replace the whole file `styles/tokens.css`:

````css
/* Design tokens — Pickle Boat brand (spec §7). Change values here, never
   hard-code colors in feature CSS. */
:root {
  /* Brand greens */
  --color-text: #273635;
  --color-brand-dark: #384d3e;
  --color-muted: #4e5650;
  --color-primary: #577047;        /* buttons/links: white text 5.5:1 */
  --color-primary-ink: #4a5f3c;    /* primary hover */
  --color-primary-bright: #5d814c; /* live/active highlights, large text only */
  --color-accent: #c9d64a;         /* pickleball yellow-green: Team 2, "you're up", alerts */
  --color-accent-ink: #273635;     /* text on accent */

  /* Neutrals */
  --color-bg: #f3f5f1;
  --color-surface: #ffffff;
  --color-surface-2: #f8faf6;
  --color-faint: #8a948d;
  --color-border: #dfe4dc;

  /* Status (messages only) */
  --color-success: #2f7d4f;
  --color-warning: #b7791f;
  --color-danger: #c0392b;

  /* Avatars without a photo (lib/avatar.js avatarIndex → 0…5) */
  --avatar-0: #577047;
  --avatar-1: #384d3e;
  --avatar-2: #5d814c;
  --avatar-3: #4e5650;
  --avatar-4: #6b7f3a;
  --avatar-5: #2f5a4a;

  /* Type */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Space Mono', ui-monospace, monospace;

  /* Spacing / shape */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --radius: 10px;
  --radius-lg: 16px;
  --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(39, 54, 53, 0.08);
  --shadow-md: 0 4px 12px rgba(39, 54, 53, 0.10);
  --shadow-lg: 0 16px 40px rgba(39, 54, 53, 0.18);

  /* Layout */
  --topbar-h: 56px;
  --content-max: 560px;
}
````

Replace the whole file `styles/base.css`:

````css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: var(--font-body);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { margin: 0; font-family: var(--font-display); }
p { margin: 0; }

.boot { min-height: 100vh; display: grid; place-items: center; color: var(--color-muted); }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  font: inherit; font-size: 0.92rem; font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.12s ease, background 0.12s ease, border-color 0.12s ease;
  white-space: nowrap;
}
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-primary) 40%, transparent); outline-offset: 2px; }
.btn--primary { background: var(--color-primary); color: #fff; }
.btn--primary:hover { background: var(--color-primary-ink); box-shadow: var(--shadow-md); }
.btn--secondary { background: var(--color-surface); color: var(--color-text); border-color: var(--color-border); }
.btn--secondary:hover { border-color: var(--color-faint); box-shadow: var(--shadow-sm); }
.btn--ghost { background: transparent; color: var(--color-muted); }
.btn--ghost:hover { background: color-mix(in srgb, var(--color-muted) 10%, transparent); color: var(--color-text); }
.btn--danger { background: var(--color-danger); color: #fff; }
.btn--danger:hover { background: color-mix(in srgb, var(--color-danger) 85%, #000); }
.btn:disabled { opacity: 0.6; cursor: default; transform: none; box-shadow: none; }
.btn--sm { padding: 6px 12px; font-size: 0.82rem; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}

/* Page column used by most screens */
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-4) var(--space-3) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.page__title { font-size: 1.6rem; line-height: 1.15; }
.page__sub { color: var(--color-muted); }

.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); box-shadow: var(--shadow-sm); }

/* Forms */
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field__label { font-weight: 600; font-size: 0.9rem; }
.field__hint { color: var(--color-muted); font-size: 0.82rem; }
.field__error { color: var(--color-danger); font-size: 0.82rem; min-height: 1.1em; }
.input {
  font: inherit; color: var(--color-text); background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: var(--radius); padding: 10px 12px; width: 100%;
}
.input:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-primary) 35%, transparent); outline-offset: 1px; border-color: var(--color-primary); }
.input[aria-invalid="true"] { border-color: var(--color-danger); }
.input-prefix { display: flex; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); }
.input-prefix > span { padding-left: 12px; color: var(--color-muted); }
.input-prefix > .input { border: 0; padding-left: 2px; }
.input-prefix:focus-within { border-color: var(--color-primary); }

/* Avatar */
.avatar { width: 40px; height: 40px; border-radius: var(--radius-full); display: inline-grid; place-items: center; overflow: hidden; color: #fff; font-weight: 700; font-size: 0.9rem; flex: none; background: var(--avatar-0); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar--lg { width: 72px; height: 72px; font-size: 1.4rem; }
.avatar--c0 { background: var(--avatar-0); } .avatar--c1 { background: var(--avatar-1); } .avatar--c2 { background: var(--avatar-2); }
.avatar--c3 { background: var(--avatar-3); } .avatar--c4 { background: var(--avatar-4); } .avatar--c5 { background: var(--avatar-5); }

.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--radius-full); background: var(--color-surface-2); border: 1px solid var(--color-border); font-size: 0.82rem; color: var(--color-muted); }
.pill--accent { background: var(--color-accent); border-color: transparent; color: var(--color-accent-ink); font-weight: 600; }
````

Replace the whole file `index.html`:

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#384d3e" />
  <title>Pickle Boat</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23384d3e'/%3E%3Ccircle cx='16' cy='16' r='8' fill='%23c9d64a'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles/tokens.css" />
  <link rel="stylesheet" href="/styles/base.css" />
  <link rel="stylesheet" href="/styles/modal.css" />
  <link rel="stylesheet" href="/styles/toast.css" />
  <link rel="stylesheet" href="/features/topbar/topbar.css" />
  <link rel="stylesheet" href="/features/signin/signin.css" />
  <link rel="stylesheet" href="/features/setup/setup.css" />
  <link rel="stylesheet" href="/features/home/home.css" />
  <link rel="stylesheet" href="/features/me/me.css" />
  <link rel="stylesheet" href="/features/profile/profile.css" />
</head>
<body>
  <div id="boot" class="boot">Loading…</div>
  <header id="topbar" class="topbar" hidden></header>
  <main id="view"></main>
  <script type="module" src="/lib/app.js"></script>
</body>
</html>
````

- [ ] **Step 2: Firebase services**

Replace the whole file `lib/firebase-config.example.js`:

````js
// Copy this file to lib/firebase-config.js and fill in your Firebase project's
// web app config (Firebase console → Project settings → Your apps → Web).
// Only used off localhost — on localhost the app talks to the local emulators
// (see lib/firebase.js), so local development needs no config file.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
````

Create `lib/firebase.js`:

````js
// Firebase SDK setup (browser only). Every Firebase import in the app pins the
// same version: 12.19.0.
//
// On localhost the app uses the local emulators (`npm run emulators`) with a
// demo project — no cloud project or config file is needed, and nothing local
// can touch production. Anywhere else it loads lib/firebase-config.js
// (gitignored; copy from firebase-config.example.js).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, memoryLocalCache,
  persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const config = isLocal
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-pickle-boat' }
  : (await import('./firebase-config.js')).firebaseConfig;

const app = initializeApp(config);
export const auth = getAuth(app);

// Production keeps data in IndexedDB so reads work offline and writes queue
// until the connection returns (court-side Wi-Fi). Local dev uses memory so a
// restarted emulator never shows stale cached data.
export const db = initializeFirestore(app, {
  localCache: isLocal
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (isLocal) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
````

Create `lib/auth.js`:

````js
// Google sign-in (spec §2: signed in with Google = verified). Browser only.
import { auth } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

// cb(user | null) on every sign-in state change. Returns unsubscribe.
export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// Resolves when signed in; rejects with a Firebase error (closing the popup
// gives code 'auth/popup-closed-by-user', which callers can ignore).
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export function signOut() {
  return fbSignOut(auth);
}
````

Create `lib/profiles.js`:

````js
// Player profiles in Firestore (spec §4.1): users/{uid} + handles/{handle}.
// Browser only; field rules live in lib/profile-input.js and firestore.rules.
import { db } from './firebase.js';
import {
  doc, getDoc, onSnapshot, writeBatch, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// cb(profile | null, undefined, { pending }) whenever users/{uid} changes,
// including when the server confirms a local write (pending → false).
// cb(undefined, error) if the snapshot fails. Returns unsubscribe.
export function watchProfile(uid, cb) {
  return onSnapshot(
    doc(db, 'users', uid),
    { includeMetadataChanges: true },
    (snap) => cb(snap.exists() ? { uid, ...snap.data() } : null, undefined, { pending: snap.metadata.hasPendingWrites }),
    (err) => cb(undefined, err),
  );
}

export async function isHandleTaken(handle) {
  return (await getDoc(doc(db, 'handles', handle))).exists();
}

// First-time setup: claim the handle and create the profile in one batch so
// the rules can check both together. Awaited (setup needs a connection).
// Throws Error('handle-taken') if someone claimed the handle first.
export async function createProfile(uid, { displayName, handle, photoURL, selfRating }) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'handles', handle), { uid });
  batch.set(doc(db, 'users', uid), {
    displayName, handle, photoURL: photoURL ?? '', selfRating, createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    if (err?.code === 'permission-denied' && await isHandleTaken(handle)) throw new Error('handle-taken');
    throw err;
  }
}

// Edits apply to the local cache immediately and sync when online, so callers
// don't await this for UI feedback — they .catch() it to report a rejection.
export function updateProfile(uid, fields) {
  return updateDoc(doc(db, 'users', uid), fields);
}

// @handle → profile, or null if no one has it.
export async function findByHandle(handle) {
  const claim = await getDoc(doc(db, 'handles', handle));
  if (!claim.exists()) return null;
  const { uid } = claim.data();
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}
````

Create `lib/qr.js`:

````js
// QR codes as inline SVG (browser only; library from jsDelivr, pinned).
import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/+esm';

// Returns SVG markup generated by the library (not user data), so it is safe
// to insert with raw(): html`<div>${raw(qrSvg(url))}</div>`.
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
````

- [ ] **Step 3: App shell and screens**

Replace the whole file `lib/app.js`:

````js
// App entry: follows the Firebase sign-in + the player's profile, keeps
// lib/session.js current, and routes per lib/route-access.js.
import { createRouter } from './router.js';
import { resolveRoute } from './route-access.js';
import { getSession, setSession, onSession, statusForProfile } from './session.js';
import { watchAuth } from './auth.js';
import { watchProfile } from './profiles.js';
import { showToast } from './toast.js';
import { renderTopbar } from '../features/topbar/topbar.js';
import { init as signin } from '../features/signin/signin.js';
import { init as setup } from '../features/setup/setup.js';
import { init as home } from '../features/home/home.js';
import { init as me } from '../features/me/me.js';
import { init as profile } from '../features/profile/profile.js';

const routes = { signin, setup, home, me, u: profile };

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const RETURN_KEY = 'pb:returnTo';

// Remember where a signed-out visitor was heading (e.g. a player-card QR) so
// they land there after signing in. sessionStorage can be unavailable.
function remember(hash) {
  try { sessionStorage.setItem(RETURN_KEY, hash); } catch { /* ignore */ }
}
function takeRemembered() {
  try {
    const hash = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return hash;
  } catch { return null; }
}

function guard(name) {
  const r = resolveRoute(getSession().status, name);
  if (r.wait) return false;
  if (r.redirect) {
    if (r.remember) remember(window.location.hash);
    const target = (r.resume && takeRemembered()) || `#/${r.redirect}`;
    window.location.replace(target); // same-page hash change → router renders again
    return false;
  }
  window.scrollTo(0, 0); // each screen starts at the top
  return true;
}

// The router is rebuilt whenever the auth status changes so the guard re-runs
// for the current hash (AGENTS.md: stop() the old one first).
let router = null;
function restartRouter() {
  router?.stop();
  router = createRouter(routes, { container: view, fallback: 'home', guard });
  router.start();
}

let lastStatus = null;
onSession((s) => {
  renderTopbar(topbar, s);
  if (s.status === lastStatus) return;
  lastStatus = s.status;
  if (s.status !== 'loading') document.getElementById('boot')?.remove();
  restartRouter();
});

let unsubProfile = null;
watchAuth((user) => {
  unsubProfile?.();
  unsubProfile = null;
  if (!user) {
    const signedOut = getSession().user !== null; // an explicit sign-out, not a first visit
    setSession({ status: 'signedOut', user: null, profile: null });
    if (signedOut) takeRemembered(); // don't send the next person to this one's page
    return;
  }
  setSession({ status: 'loading', user, profile: null });
  unsubProfile = watchProfile(user.uid, (p, err, meta) => {
    if (err) { showToast(`Could not load your profile: ${err.message}`, 'error'); return; }
    const status = statusForProfile(getSession().status, p, meta.pending);
    if (status) setSession({ profile: p, status });
  });
});
````

Create `features/shared/rating-field.js`:

````js
// Self-rating picker shared by profile setup and the My profile edit form.
import { html } from '../../lib/html.js';
import { ratingOptions, levelFor } from '../../lib/profile-input.js';

export function ratingFieldHtml(selected) {
  const level = levelFor(selected);
  return html`
    <label class="field">
      <span class="field__label">Your level</span>
      <select class="input" name="selfRating">
        ${ratingOptions().map((r) => html`<option value="${r}" ${r === selected ? 'selected' : ''}>${r.toFixed(1)} · ${levelFor(r).label}</option>`)}
      </select>
      <span class="field__hint" data-level-hint>${level ? level.hint : ''}</span>
      <span class="field__error" data-error="selfRating"></span>
    </label>`;
}

// Keeps the hint under the picker in step with the chosen level.
export function wireRatingField(form) {
  const select = form.querySelector('[name="selfRating"]');
  const hint = form.querySelector('[data-level-hint]');
  select.addEventListener('change', () => {
    hint.textContent = levelFor(Number(select.value))?.hint ?? '';
  });
}

// Shows each field's message (or clears it) from validateProfileInput().errors.
export function showErrors(form, errors) {
  for (const el of form.querySelectorAll('[data-error]')) {
    const msg = errors[el.dataset.error] ?? '';
    el.textContent = msg;
    form.querySelector(`[name="${el.dataset.error}"]`)?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
}
````

Create `features/topbar/topbar.js`:

````js
// App header, shown once the player has a profile. Rendered by lib/app.js.
import { html } from '../../lib/html.js';
import { avatarHtml } from '../../lib/avatar.js';

export function renderTopbar(el, { status, profile }) {
  el.hidden = status !== 'ready';
  el.innerHTML = status === 'ready'
    ? html`
      <a class="topbar__brand" href="#/home">Pickle Boat</a>
      <a class="topbar__me" href="#/me" aria-label="My profile">${avatarHtml(profile)}</a>`
    : '';
}
````

Create `features/topbar/topbar.css`:

````css
.topbar {
  position: sticky; top: 0; z-index: 50;
  height: var(--topbar-h);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--space-3);
  background: var(--color-brand-dark); color: #fff;
}
.topbar[hidden] { display: none; }
.topbar__brand { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; color: #fff; text-decoration: none; }
.topbar__me { display: inline-flex; border-radius: var(--radius-full); }
.topbar__me:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
.topbar .avatar { width: 34px; height: 34px; font-size: 0.8rem; box-shadow: 0 0 0 2px var(--color-accent); }
````

Create `features/signin/signin.js`:

````js
// Sign-in screen (#/signin). Google sign-in is the only method (spec §2).
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { signInWithGoogle } from '../../lib/auth.js';

const IGNORED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

export function init(container) {
  container.innerHTML = html`
    <section class="signin">
      <p class="signin__brand">Pickle Boat</p>
      <h1 class="signin__title">Open play, without the paddle pile.</h1>
      <p class="signin__sub">Check in, join the queue from your phone, and see when you're up.</p>
      <button type="button" class="btn btn--primary signin__google" id="google">Continue with Google</button>
      <p class="signin__note">Signing in with Google verifies your player account.</p>
    </section>`;

  const btn = container.querySelector('#google');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await signInWithGoogle(); // lib/app.js moves on once the auth state changes
    } catch (err) {
      if (!IGNORED.has(err?.code)) showToast(`Sign-in failed: ${err?.message ?? err}`, 'error');
      btn.disabled = false;
    }
  });
}
````

Create `features/signin/signin.css`:

````css
.signin {
  min-height: 100vh;
  max-width: var(--content-max); margin: 0 auto;
  padding: clamp(48px, 12vh, 120px) var(--space-4) var(--space-5);
  display: flex; flex-direction: column; justify-content: center; gap: var(--space-3);
}
.signin__brand { color: var(--color-primary); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.8rem; }
.signin__title { font-size: clamp(2rem, 7vw, 2.8rem); line-height: 1.08; }
.signin__sub { color: var(--color-muted); font-size: 1.05rem; }
.signin__google { align-self: flex-start; margin-top: var(--space-2); padding: 12px 20px; }
.signin__note { color: var(--color-faint); font-size: 0.85rem; }
````

Create `features/setup/setup.js`:

````js
// First-time profile setup (#/setup): name, unique @handle, self-rating.
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { getSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { suggestHandle } from '../../lib/handle.js';
import { NAME_MAX, DEFAULT_SELF_RATING, cleanName, validateProfileInput } from '../../lib/profile-input.js';
import { createProfile, isHandleTaken } from '../../lib/profiles.js';
import { ratingFieldHtml, wireRatingField, showErrors } from '../shared/rating-field.js';

const CHECK_DELAY_MS = 400;

export function init(container) {
  const { user } = getSession();
  const name = cleanName(user?.displayName);
  const photoURL = user?.photoURL ?? '';

  container.innerHTML = html`
    <section class="page setup">
      <h1 class="page__title">Set up your player profile</h1>
      <p class="page__sub">This is how organizers and other players find you.</p>
      <form class="card setup__form" novalidate>
        <div class="setup__photo">${avatarHtml({ displayName: name, photoURL, uid: user?.uid }, { large: true })}</div>
        <label class="field">
          <span class="field__label">Name</span>
          <input class="input" name="displayName" value="${name}" maxlength="${NAME_MAX}" autocomplete="name" required>
          <span class="field__error" data-error="displayName"></span>
        </label>
        <label class="field">
          <span class="field__label">Handle</span>
          <span class="input-prefix"><span>@</span><input class="input" name="handle" value="${suggestHandle(name)}" maxlength="20" autocapitalize="off" autocomplete="off" spellcheck="false"></span>
          <span class="field__hint" data-handle-status>Players can search for you by this.</span>
          <span class="field__error" data-error="handle"></span>
        </label>
        ${ratingFieldHtml(DEFAULT_SELF_RATING)}
        <button class="btn btn--primary" type="submit">Create profile</button>
      </form>
    </section>`;

  const form = container.querySelector('form');
  const handleInput = form.querySelector('[name="handle"]');
  const status = form.querySelector('[data-handle-status]');
  const submit = form.querySelector('[type="submit"]');
  wireRatingField(form);

  // Live "is this handle free?" check; only the latest answer is shown.
  let timer = null;
  let checkId = 0;
  async function checkHandle() {
    const { value, errors } = validateProfileInput({ handle: handleInput.value });
    showErrors(form, { handle: errors.handle });
    if (errors.handle) { status.textContent = ''; return; }
    const id = ++checkId;
    status.textContent = 'Checking…';
    try {
      const taken = await isHandleTaken(value.handle);
      if (id !== checkId) return;
      status.textContent = taken ? '' : `@${value.handle} is available.`;
      showErrors(form, { handle: taken ? `@${value.handle} is taken — try another.` : undefined });
    } catch {
      if (id === checkId) status.textContent = '';
    }
  }
  handleInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(checkHandle, CHECK_DELAY_MS);
  });
  checkHandle();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const { ok, value, errors } = validateProfileInput(data);
    showErrors(form, errors);
    if (!ok) return;
    submit.disabled = true;
    submit.textContent = 'Creating…';
    try {
      await createProfile(user.uid, { ...value, photoURL });
      showToast(`Welcome, ${value.displayName}!`, 'success'); // lib/app.js routes on from here
    } catch (err) {
      if (err.message === 'handle-taken') showErrors(form, { handle: `@${value.handle} was just taken — try another.` });
      else showToast(`Could not create your profile: ${err.message}`, 'error');
      submit.disabled = false;
      submit.textContent = 'Create profile';
    }
  });

  container.addEventListener('view:teardown', () => clearTimeout(timer), { once: true });
}
````

Create `features/setup/setup.css`:

````css
.setup__form { display: flex; flex-direction: column; gap: var(--space-3); }
.setup__photo { display: flex; justify-content: center; }
.setup__form .btn--primary { align-self: stretch; padding: 12px; }
````

Replace the whole file `features/home/home.js`:

````js
// Home (#/home). Placeholder until Plan 3 brings My Sessions here.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';

export function init(container) {
  const { profile } = getSession();
  container.innerHTML = html`
    <section class="page home">
      <h1 class="page__title">Hi, ${profile.displayName}</h1>
      <div class="card home__soon">
        <h2 class="home__soon-title">Sessions are coming next</h2>
        <p class="page__sub">Soon you'll create open-play sessions, check in by QR, and queue for courts from here.</p>
      </div>
      <a class="btn btn--secondary home__card-link" href="#/me">Show my player card</a>
    </section>`;
}
````

Replace the whole file `features/home/home.css`:

````css
.home__soon { display: flex; flex-direction: column; gap: var(--space-2); }
.home__soon-title { font-size: 1.1rem; }
.home__card-link { align-self: flex-start; text-decoration: none; }
````

Create `features/me/me.js`:

````js
// My profile (#/me): player card with QR, edit name/level, sign out.
import { html, raw } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { getSession, onSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { levelFor, NAME_MAX, validateProfileInput } from '../../lib/profile-input.js';
import { updateProfile } from '../../lib/profiles.js';
import { signOut } from '../../lib/auth.js';
import { qrSvg } from '../../lib/qr.js';
import { ratingFieldHtml, wireRatingField, showErrors } from '../shared/rating-field.js';

// Absolute link to a public profile — what the player-card QR encodes.
export function profileUrl(handle) {
  return `${window.location.origin}${window.location.pathname}#/u/${handle}`;
}

function cardHtml(p) {
  return html`
    ${avatarHtml(p, { large: true })}
    <div class="me__who">
      <p class="me__name">${p.displayName}</p>
      <p class="me__handle">@${p.handle}</p>
      <span class="pill pill--accent">${p.selfRating.toFixed(1)} · ${levelFor(p.selfRating)?.label ?? ''}</span>
    </div>`;
}

export function init(container) {
  const p = getSession().profile;
  container.innerHTML = html`
    <section class="page me">
      <div class="card me__card">
        <div class="me__head" data-card>${cardHtml(p)}</div>
        <div class="me__qr">${raw(qrSvg(profileUrl(p.handle)))}</div>
        <p class="me__qr-note">Organizers scan this with their phone camera to find you.</p>
      </div>
      <form class="card me__form" novalidate>
        <h2 class="me__form-title">Edit profile</h2>
        <label class="field">
          <span class="field__label">Name</span>
          <input class="input" name="displayName" value="${p.displayName}" maxlength="${NAME_MAX}" autocomplete="name">
          <span class="field__error" data-error="displayName"></span>
        </label>
        ${ratingFieldHtml(p.selfRating)}
        <button class="btn btn--primary" type="submit">Save</button>
      </form>
      <button type="button" class="btn btn--ghost me__signout" id="signout">Sign out</button>
    </section>`;

  const form = container.querySelector('form');
  wireRatingField(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const { ok, value, errors } = validateProfileInput(data);
    showErrors(form, errors);
    if (!ok) return;
    // Applies locally at once and syncs when online (offline-tolerant).
    updateProfile(p.uid, value).catch((err) => showToast(`Could not save: ${err.message}`, 'error'));
    showToast('Profile saved.', 'success');
  });

  container.querySelector('#signout').addEventListener('click', () => {
    signOut().catch((err) => showToast(`Could not sign out: ${err.message}`, 'error'));
  });

  // Keep the card in sync with saved edits (the form keeps what's typed).
  const head = container.querySelector('[data-card]');
  const off = onSession((s) => { if (s.profile) head.innerHTML = cardHtml(s.profile); });
  container.addEventListener('view:teardown', off, { once: true });
}
````

Create `features/me/me.css`:

````css
.me__card { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); text-align: center; }
.me__head { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.me__who { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }
.me__name { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; }
.me__handle { color: var(--color-muted); font-family: var(--font-mono); }
.me__qr { width: min(240px, 70vw); background: #fff; padding: var(--space-2); border-radius: var(--radius); border: 1px solid var(--color-border); }
.me__qr svg { display: block; width: 100%; height: auto; }
.me__qr-note { color: var(--color-muted); font-size: 0.85rem; }
.me__form { display: flex; flex-direction: column; gap: var(--space-3); }
.me__form-title { font-size: 1.1rem; }
.me__form .btn--primary { align-self: flex-start; }
.me__signout { align-self: center; }
````

Create `features/profile/profile.js`:

````js
// Public player profile (#/u/{handle}) — where a player-card QR lands.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { normalizeHandle, isValidHandle } from '../../lib/handle.js';
import { levelFor } from '../../lib/profile-input.js';
import { findByHandle } from '../../lib/profiles.js';

export function init(container, param) {
  const handle = normalizeHandle(decodeURIComponent(param ?? ''));
  let alive = true;
  container.addEventListener('view:teardown', () => { alive = false; }, { once: true });

  const show = (body) => { if (alive) container.innerHTML = html`<section class="page profile">${body}</section>`; };
  const missing = (why) => show(html`
    <h1 class="page__title">No player found</h1>
    <p class="page__sub">${why}</p>
    <a class="btn btn--secondary profile__back" href="#/home">Back home</a>`);

  if (!isValidHandle(handle)) { missing("This isn't a valid player link."); return; }
  show(html`<p class="page__sub">Loading @${handle}…</p>`);

  findByHandle(handle).then((p) => {
    if (!p) { missing(`Nobody has the handle @${handle}.`); return; }
    const mine = p.uid === getSession().user?.uid;
    show(html`
      <div class="card profile__card">
        ${avatarHtml(p, { large: true })}
        <h1 class="profile__name">${p.displayName}</h1>
        <p class="profile__handle">@${p.handle}</p>
        <span class="pill pill--accent">${p.selfRating.toFixed(1)} · ${levelFor(p.selfRating)?.label ?? ''}</span>
        ${mine ? html`<a class="btn btn--secondary profile__edit" href="#/me">Edit my profile</a>` : ''}
      </div>`);
  }).catch((err) => show(html`
    <h1 class="page__title">Couldn't load this player</h1>
    <p class="page__sub">${err.message}</p>`));
}
````

Create `features/profile/profile.css`:

````css
.profile__card { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); text-align: center; }
.profile__name { font-size: 1.5rem; }
.profile__handle { color: var(--color-muted); font-family: var(--font-mono); }
.profile__edit, .profile__back { margin-top: var(--space-2); text-decoration: none; align-self: center; }
````

- [ ] **Step 4: Verify**

Run `npm test`. Expected: all pass, including `html-usage` (no bare arrays assigned to `innerHTML`, and no `escape.js` imports outside `lib/html.js`).

Then start the stack in two terminals: `npm run emulators` (wait for "All emulators ready") and `npm run serve`. Open `http://localhost:5174` at phone width (390×844), with Playwright or by hand, and check each item:

- **B1** No console errors on load (no favicon 404).
- **B2** Open `http://localhost:5174/#/me` while signed out. It redirects to `#/signin`.
- **B3** Click *Continue with Google*, then close the emulator popup. No error toast appears and the button re-enables.
- **B4** Sign in through the emulator popup (*Add new account*, then name "María Dela Cruz"). Setup shows the name, the suggested `@maria_dela_cruz` marked available, and the level guide. Pick 4.0 and click *Create profile*. You land on **`#/me`** (the remembered route) with the top bar, QR card and "4.0 · Intermediate".
- **B5** Sign out, then sign in as a new account "Ben". Type handle `maria_dela_cruz`: it shows as taken. Submit anyway. The form **keeps its values** and shows "@maria_dela_cruz was just taken — try another." without re-rendering. Type `Ben P!` and the 3–20 characters error shows. Use `ben_p` and it succeeds.
- **B6** On `#/me`, change the name and level and click *Save*. The card updates. An empty name shows "Enter your name."
- **B7** `#/u/MARIA_DELA_CRUZ` opens María's profile. `#/u/nobody_here` says "Nobody has the handle @nobody_here." `#/u/bad!` says "This isn't a valid player link."
- **B8** Sign out from `#/me`. `sessionStorage['pb:returnTo']` is empty. Signing back in lands on `#/home`.

Stop the emulators and the server when done.

- [ ] **Step 5: Commit**

```bash
git add styles/tokens.css styles/base.css index.html lib/firebase-config.example.js lib/firebase.js lib/auth.js lib/profiles.js lib/qr.js lib/app.js features/
git commit -m "feat: Google sign-in, profile setup, player card QR and public profiles"
```

### Task 4: Docs: run/test instructions, index and spec deltas

**Files:**
- Modify: `AGENTS.md`, `docs/INDEX.md`, `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: AGENTS.md**

Replace the `## Run / test` code block and its following paragraph with:

````markdown
```bash
npm run emulators   # Firebase auth + Firestore emulators (demo-pickle-boat) — needs Java 21+
npm run serve       # python3 serve.py 5174 → http://localhost:5174 (no-cache)
npm test            # node --test → unit tests for the pure lib/ modules
npm run test:rules  # Firestore security-rules suite on the emulator
```

First time: `npm --prefix rules-tests install`. Java: if `java -version` fails,
`rules-tests/with-java.sh` uses a user-space JDK in `~/.local/jdk` (see Plan 2,
Task 2, Step 0). On localhost the app always talks to the emulators, so local
work never touches production and needs no `lib/firebase-config.js`.

Always run `npm test` (and `npm run test:rules` after any `firestore.rules`
change) before claiming a change is done. Verify on **localhost first**; only
deploy on an explicit go-ahead.
````

In the `lib/` section, change the pure-logic line to:
`` - **Pure logic** (no DOM, no Firebase): `escape`, `html`, `router.parseHash`, `handle`, `score-flow`, `session-stats`, `team-balance`, `queue-engine`, `results`, `profile-input`, `route-access`, `avatar`, `session`. ``
and the browser/services line to:
`` - **Browser / services** (touch the DOM or a backend): `app` (auth → session → guarded routes), `router.createRouter`, `firebase`, `auth`, `profiles`, `qr`, `toast`, `confirm`. ``

- [ ] **Step 2: docs/INDEX.md**

In **Features**, replace the `home` row with:

```markdown
| `signin` | Google sign-in (verified = signed in). | `features/signin/`, `lib/auth.js` |
| `setup` | First-time profile: name, unique @handle (live availability), self-rating. | `features/setup/`, `lib/profiles.js` |
| `me` | Player card with QR (→ `#/u/{handle}`), edit name/level, sign out. | `features/me/`, `lib/qr.js` |
| `profile` | Public profile `#/u/{handle}`. | `features/profile/` |
| `home` | Placeholder until Plan 3's My Sessions. | `features/home/` |
```

(The **Plans** row for this plan was added when the plan was committed. Leave it.)

In **Architecture & core knowledge**, add:

```markdown
| Auth & routing | `lib/app.js` watches auth + profile → `lib/session.js`; `resolveRoute()` decides signin/setup/ready screens; signed-out deep links resume after sign-in. | `lib/route-access.js`, `lib/session.js` |
| Firebase locally | localhost → emulators (`demo-pickle-boat`), never production; `npm run emulators`; rules suite `npm run test:rules`. | `lib/firebase.js`, `rules-tests/` |
```

In **Key decisions**, add:

```markdown
| 2026-10-03 | Emulator-first: localhost always uses Firebase emulators with a demo project. | Build and test everything without a cloud project; local can't touch prod. |
| 2026-10-03 | @handle fixed after creation; Google photo, no upload; badges denied by rules until "Pro". | Keep v1 simple; uniqueness stays trivially correct. |
```

- [ ] **Step 3: Spec deltas**

In the spec:
- §4.1 `handles/{handle}` row: append "Fixed after creation (never changed or freed)."
- §4.1 `users/{uid}` row: after `photoURL`, add "(the Google account photo; no upload yet)".
- §9: add a bullet "First-time profile setup needs a connection (its batch is awaited); a new player's unconfirmed local profile write doesn't count until the server confirms it, so a rejected handle never bounces the app off the setup screen."
- §12: add a bullet "Local development uses the Firebase emulators with the `demo-pickle-boat` project, so no cloud project is needed until go-live."

- [ ] **Step 4: Verify and commit**

Run `npm test`. Expected: all pass.

```bash
git add AGENTS.md docs/INDEX.md docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md
git commit -m "docs: run/test with emulators, index plan 2, spec deltas"
```

### Task 5: Go live — create the Firebase project (⚠ user go-ahead required)

**Executed by the controller (Opus) personally, never a subagent. Do not start until the user explicitly says to create the Firebase project.** This step is outward-facing (AGENTS.md: deploy only on explicit request, verify after deploying).

**Files:** Create `.firebaserc`; create (gitignored) `lib/firebase-config.js`.

- [ ] **Step 1:** Ask the user for the project ID (suggest `pickle-boat-<suffix>`) and region for Firestore (suggest `asia-southeast1`, which is near the paddle-district users). Then create the project (Firebase console, or the Firebase MCP `firebase_create_project`), register a **Web app**, and copy its config into `lib/firebase-config.js` using the shape in `lib/firebase-config.example.js`.
- [ ] **Step 2:** In the console: enable **Authentication → Google** and create the **Firestore** database (production mode) in the chosen region.
- [ ] **Step 3:** Write `.firebaserc`: `{ "projects": { "default": "<project-id>" } }`. Commit it.
- [ ] **Step 4:** Run `npm run test:rules` (green), then deploy the rules **from the CLI**: `npx --prefix rules-tests firebase deploy --only firestore:rules --project <project-id>`. Verify by reading the rules back (Firebase console or MCP `firebase_get_security_rules`) and diffing them against `firestore.rules`. Hosting predeploy refuses to deploy without lib/firebase-config.js.
- [ ] **Step 5 (only if the user also asks to deploy hosting):** `npx --prefix rules-tests firebase deploy --only hosting --project <project-id>`. Add the hosting domain to **Auth → Settings → Authorized domains**. Fetch a served file (e.g. `/lib/app.js`) and diff it against the local copy. Fetch `/.git/HEAD`, `/docs/INDEX.md` and `/firestore.rules`: each must 404. Hosting predeploy refuses to deploy without lib/firebase-config.js.


## Carried forward to Plan 3 (from reviews)

- Public routes (`tv`, and the TV's join QR target) re-render on every auth-status change because `restartRouter` runs on each change. Skip the restart when the current route is public, or keep those views cheap to re-init.
- Any view replaced outside the router must get `view:teardown` first (as `showStalled` now does). The host and TV views hold snapshots and timers.
- `users` listing is capped at 25 per query, so organizer profile search must always set `limit(≤25)`. Case-insensitive name search would need a `nameLower` field (a rules and schema change), so decide it up front.
- `#boot` is a 100vh block above `#view`, so the TV view sits below the fold until auth resolves. Hide or shrink it for public routes.
- Open a11y items for the design phase: hints inside `<label>` pollute the accessible name; no focus or `document.title` management on route change.
- After the first deploy, check `curl -I /` and confirm the no-cache header applies to the root `index.html`.
- Small UX leftovers: "Profile saved." shows before the server confirms (offline convention); the setup "Waiting for a connection…" hint can linger after a late rejection; opening the dev server by LAN IP takes the production config path (document it in AGENTS).
