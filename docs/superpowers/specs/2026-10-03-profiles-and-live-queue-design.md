# Spec 1 — Profiles & Live Session Paddle Queue

**Date:** 2026-10-03 · **Status:** Draft for review · **Covers:** sub-projects #1 and #3

## 1. Purpose & product context

Paddle District v2 is a pickleball open-play app built around a **paddle queueing
system** (with paddle stacking as one of its modes) plus Reclub-style community
features. It combines three goals:

- **A — Run open play** for our own group: organizer tools for courts, queue,
  scores, and standings.
- **B — Many organizers:** any account can create and run its own, fully
  separate sessions.
- **C — Players self-serve** from their phones using a verified Paddle District
  account (check in, queue, report scores) instead of one scorekeeper doing
  everything.

### Sub-project decomposition

| # | Sub-project | Status |
|---|---|---|
| 1 | Accounts & profiles | **This spec** |
| 2 | Clubs & events (clubs, members, event listings, RSVP) | Later spec |
| 3 | Live session & paddle queue | **This spec** |
| 4 | Stats & community (in-house DUPR-style rating, cross-session rankings, feed/chat) | Later spec |

> **Rebuild, separate data.** This is Paddle District **v2**, a from-scratch
> rebuild (renamed from the working title "Pickle Boat" on 2026-10-03). It lives
> in the fork `jvallno/paddle-district` (v2 is the fork's `main` since 2026-10-03; v1 is preserved as branch `v1` / tag `v1.0`). v2
> shares **no** code, database, users, or sessions with v1 or with the original
> owner's Firebase project — v1 is only one of its inspirations.

Spec 1 must store data so #2 and #4 can be added without reworking it — in
particular the append-only **results log** (§4.3) that #4's rating engine replays.

### Inspiration: what paddle-district does

Single-scorekeeper app on Firebase Realtime Database (one blob per session).
The organizer marks attendance; the app keeps up to 3 pre-built 2v2 matches
ordered by "longest since last played"; the organizer taps *Generate Match* per
court; submitting a score sends all four to the back of the line. Swaps, score
edits (reverse + reapply stats), leaderboard (Wins / Points / Win% / Pt%,
tiebreak score diff), game history, end/continue session, public read-only
`view.html` with QR. No player accounts, no cross-session identity. Paddle District
borrows the idea of its fairness ordering as one mode and designs everything
else independently; nothing is migrated or imported from it.

## 2. Decisions (agreed in brainstorm)

| Topic | Decision |
|---|---|
| Verified user | **Signed in with Google** = verified — and Google is the **only** sign-in method (no email/password, unlike v1; decided 2026-10-03). Phone / club-approved / rating-verified badges and per-session badge requirements are deferred to a later "Pro" stage. |
| Who can organize | **Any account** can create sessions. "Organizer" is a per-session role, not an account type. |
| Roles per session | **Owner** (everything, incl. managing co-organizers, delete) · **Co-organizer** (run the floor, settle scores, be host, end/continue) · **Player** (own actions only). |
| Queue model | **One engine, mode chosen per session:** *fairness* or *stacking*, plus a court rule: *everyone off*, *winners stay (max N)*, *winners split*. |
| Score reporting | A player in the match **submits**, a player on the **opposing team confirms**, organizers can **override**. Court frees on submit. |
| Getting in | **Scan session QR** at the venue (`#/join/{sid}`) **or organizer searches & adds** a verified profile. RSVP check-in comes with #2. **Accounts are optional (v1 parity, decided 2026-10-03):** the session QR also offers v1's name-only self check-in (pick your name from the roster; names not on it wait for organizer approval), with a prominent "Sign in to save your stats" nudge; organizers can later link a name-only player to a real profile. Details land in Plan 3. |
| Guests (name-only players) | Name-only players come from a pasted roster (v1's import), name-only self check-in, or an organizer adding a name, if the session allows them. Guests play and appear on **that session's** courts/queue/leaderboard only — never in `results`, ratings, or cross-session stats; no profile. |
| Rating | In-house **DUPR-style, margin-based** rating (2.000–8.000, reliability %), built in #4. Spec 1 only stores a **self-rating** and the results log. |
| Backend | **Firebase** (Auth + Firestore + Hosting) in a **new Firebase project** dedicated to Paddle District. **Host-device** architecture (§5). |
| Repo | **New GitHub repository** for Paddle District. |
| Relationship to v1 | **Rebuild with separate data** — no shared code, Firebase project, users, or data with v1 (original owner's project); v1 is inspiration only. |
| Environments | **Two only:** **Local** (localhost against the live project by default, or the Firebase emulators with `?emulators`) and **Live** — the user's own Firebase project `paddle-district-v2` (Firestore in `asia-southeast1`), served at https://paddle-district-v2.web.app. |
| Brand | **v1's Paddle District branding, unchanged** (decided 2026-10-03; replaces the earlier green palette): logo mascot badge, Montserrat, army green + lime + gold, light/dark toggle (§7). |
| v1 parity | v2 keeps **every v1 feature** and adds the new ones; v1-only features (paste roster, name-only check-in + approval, On hold, cancel match, edit past score, export CSV/JSON, end/continue, share link + QR toggles, live view) are built in Plan 3. Order: Step 1 rebrand → Plan 3 sessions with v1 parity → clubs/events → ratings/community. |

## 3. Scope

**In scope:** Google sign-in; profile setup (name, unique `@handle`, photo,
self-rating) and player card QR; public profile; create/configure sessions;
co-organizers; QR check-in and organizer add (profiles + guests); the live queue
engine (both modes, all three court rules); score submit/confirm/dispute/
override; host election + takeover; organizer controls (swap, reorder, courts,
end/continue); player session view; public TV view; per-session leaderboard and
game history; results log; security rules + emulator tests.

**Out of scope (later):** clubs, events, RSVP (#2); rating engine,
cross-session rankings, feed, chat (#4); phone/club/rating badges and badge
requirements ("Pro"); DUPR integration; payments; push notifications; claiming
guest history.

## 4. Data model (Firestore)

### 4.1 Profiles

| Path | Contents | Written by |
|---|---|---|
| `users/{uid}` | `displayName`, `handle`, `photoURL` (the Google account photo; no upload yet), `selfRating` (2.0–8.0, step 0.5), `createdAt` | Owner only |
| `handles/{handle}` | `{ uid }` — guarantees unique `@handle` (lower-case, `[a-z0-9_]{3,20}`) | Owner, same batch as profile; create-only. Fixed after creation (never changed or freed). |

### 4.2 Sessions

| Path | Contents | Written by |
|---|---|---|
| `sessions/{sid}` | `name`, `date`, `venue`, `ownerId`, `organizerIds[]` (includes owner), `courts[] {id,name,paused}`, `mode` (`fairness`\|`stacking`), `courtRule {type: everyoneOff\|winnersStay\|winnersSplit, maxWins}` (default `maxWins` 2), `guestsAllowed`, `status` (`live`\|`ended`), `host {deviceId, uid, beatAt, version}`, `createdAt` | Organizers; only owner changes `ownerId`/`organizerIds` |
| `sessions/{sid}/participants/{pid}` | `uid` (null for guests), `isGuest`, `displayName`, `selfRating`, `status` (`here`\|`break`\|`left`), `checkedInAt`, `clientAt`. `pid` = uid for real players, `g_<random>` for guests | Player (own record) or organizers |
| `sessions/{sid}/queueEntries/{eid}` | `players[]` (1, 2, or 4 pids), `createdBy`, `accepted[]`, `status` (`open`\|`assigned`\|`cancelled`); an entry is *ready* when every listed player is in `accepted[]`, `createdAt` (server ts), `clientAt`. Solo entry id = `{pid}_{n}` (deterministic per stack so double-taps don't duplicate) | Players (entries containing themselves; partners add only their own acceptance) or organizers; host sets `assigned` |
| `sessions/{sid}/live/state` | Host-computed view everyone watches: `mode`, `courts[] {courtId, name, paused, matchId, team1[], team2[], startedAt, holding[]}`, `queue[] {pids[], eid?, ready?}`, `names {pid: displayName}`, `updatedAt`, plus host-added `hostDeviceId`, `version` | Host (organizer device) only |
| `sessions/{sid}/matches/{mid}` | `courtId`, `team1[]`, `team2[]`, `names {pid: displayName}` (snapshot so the public TV view never needs to read `participants`), `startedAt`, `endedAt`, `score {t1, t2}`, `submittedBy`, `respondedBy` (who confirmed or disputed), `streaks {pid: winsInARow}`, `loggedSig`, `loggedRid`, `status` (`playing`→`submitted`→`confirmed`\|`disputed`\|`overridden`), `overriddenBy`, `clientAt` | Host creates; match players submit/confirm/dispute; organizers override |

### 4.3 Results log

| Path | Contents | Written by |
|---|---|---|
| `results/{rid}` | `sessionId`, `matchId`, `team1[]`/`team2[]` of `{uid \| null, isGuest}`, `score {t1,t2}`, `playedAt`, `kind` (`result`\|`correction`), `corrects` (rid, for corrections) | Host, when a match becomes `confirmed` or `overridden`. **Append-only**: never updated/deleted; a later override writes a `correction` entry pointing at the previous entry for that match (a chain) |

### 4.4 Shape rationale

- Players write only **intents** (participants, queue entries, own score
  fields); the host alone writes **decisions** (`live/state`, new matches,
  results). No conflicting edits; simple rules.
- Live screens subscribe to **one doc** (`live/state`) → fast and cheap.
- Session leaderboard = computed from that session's `matches` (guests
  included; names come from each match's `names` snapshot, so it works on the
  public TV view). Cross-session stats (#4) read only `results` (guests excluded).
- **My Sessions** = `sessions where organizerIds array-contains me` ∪
  collection-group `participants where uid == me` (needs a composite index).

## 5. Queue engine & host

### 5.1 Pure engine

`lib/queue-engine.js` exports
`step({ config, participants, entries, matches, now, makeId }) → { newMatches, entryUpdates, state }` — court occupancy is derived from `matches`, so no previous state or rng is needed; results-log entries come from `pendingResults()` in `lib/results.js`. `makeId` receives context — `{kind:'match', courtId, prevMid}` / `{kind:'result', mid, sig}` — so the host can use deterministic ids.
No DOM/Firebase; deterministic. The host calls it on every relevant
snapshot change and on a 1 s tick for timers.

### 5.2 Fairness mode

- Checking in (`status: here`) puts you in the rotation automatically; *Take a
  break* removes you; *I'm back* returns you.
- When a court is free: pick the 4 longest-waiting — never-played first, then
  oldest last-game end time, then earliest `checkedInAt`.
- Teams: of the 3 possible 2v2 splits, choose the one minimizing
  |team average `selfRating` difference|; ties prefer splits that don't repeat
  the most recent partnerships.

### 5.3 Stacking mode

- Players explicitly **stack** — solo, or a group of 2 or 4 (a group entry
  is ready once every listed partner has accepted).
- Order is first-come by server `createdAt` (fallback `clientAt` while pending).
- Filling a free court from the front: a free court is filled by the
  **earliest combination of ready entries, in line order, whose sizes add up
  exactly to the open slots** (a group of 4 takes a whole court; pairs stay
  together; solos pair up in arrival order). Entries that aren't ready, or that
  can't be part of an exact fit, keep their place. Groups keep their chosen teams.
- After a game players are **not** auto-re-stacked; their phone shows a
  one-tap **Stack again**.

### 5.4 Court rules (both modes)

- **Everyone off:** all four leave the court (fairness: back to the pool;
  stacking: offered *Stack again*).
- **Winners stay (max N, default 2):** winning team stays; the next two players
  from the queue challenge. After N consecutive wins, or a tie, everyone off.
- **Winners split:** the two winners stay but split, each partnering one of the
  next two incoming players. Same max-N and tie handling.
- In stacking mode, challengers are the next pair entry or next two solos; a
  group of 4 cannot challenge and keeps its place for the next empty court.
- Stacking only: if winners are holding a court but no ready challengers fit, and a ready group of exactly 4 exists, the holders are released (everyone off) and that group takes the court — prevents a deadlock.

### 5.5 Court lifecycle

A court frees the moment a score is **submitted**; confirmation and disputes
are resolved afterwards and never block the queue. Paused courts are skipped.

### 5.6 Host election & takeover

- Lease on `sessions/{sid}.host`. The host renews `beatAt` every **5 s**. Any
  organizer device seeing `beatAt` older than **20 s** may claim it.
- Claim uses a Firestore **transaction** — a deliberate, documented exception
  to the "no transactions" lesson (rare; two hosts is worse).
- Each host write carries `hostDeviceId` + monotonically increasing `version`;
  before writing, a host checks it still holds the lease and stops if not
  (covers a host reconnecting after being replaced).
- Regular host writes use `writeBatch`, fire-and-forget.
- Organizers can see which device is host and press **Make this device the
  host** (forced takeover).
- With no live host, everyone sees "Queue paused — no host"; organizers see
  **Become host**. Player intents keep saving meanwhile; the next host catches up
  immediately.

## 6. Screens & flows

| Route | Screen | Access |
|---|---|---|
| `#/signin` | Google sign-in | Anyone |
| `#/setup` | First-time profile: name, unique `@handle`, photo, self-rating with level guide | New accounts |
| `#/home` | **My Sessions** (live → upcoming → past) + **Create session** | Signed in |
| `#/me` | My profile + **player card** QR (links to `#/u/{handle}`) | Signed in |
| `#/u/{handle}` | Public profile; organizers see **Add to my session** | Signed in |
| `#/new` | Create session (name, date, venue, courts, mode, court rule, guests) | Signed in |
| `#/join/{sid}` | Session QR target: sign in → setup if needed → auto check-in | Anyone |
| `#/s/{sid}` | Session (role-aware, below) | Participants & organizers |
| `#/tv/{sid}` | Public live view: courts, timers, queue, leaderboard, big join QR, dark theme | Public, no sign-in |

**Player view:** status card (*Waiting, 3rd in line* / *Up next on Court 2* /
*Playing on Court 1* / *On break*); mode actions (**Stack me** solo or with
chosen players, **Stack again**, **Take a break / I'm back**, **Leave
session**); **Submit score** while playing; opponents get *"Ben submitted 11–7 —
Confirm / Dispute"*; courts, queue, and session leaderboard below.

**Organizer view (tabs):**
- **Courts** — live courts + timers; override/fix score; swap a player; pause/remove court.
- **Queue** — full order; move, remove, send to front.
- **Players** — checked-in players and guests; search & add profile; add guest; make co-organizer.
- **Scores** — disputed/unconfirmed to settle; full game history.
- **Settings** — mode, court rule, guests, courts; current host + **Make this device the host**; **End / Continue session**.

Player-card QR opens a profile URL, so organizers scan it with the phone's
**native camera** — no scanner library. The public TV view shows display names
and the session leaderboard (as paddle-district does); profile details stay
behind sign-in.

Leaderboard columns and tiebreaks follow paddle-district (Wins, Points, Win%,
Pt%, GP, score diff), computed by `lib/session-stats.js`.

## 7. Brand & visual system (v1 branding, decided 2026-10-03)

v2 keeps Paddle District v1's look. All values live in `styles/tokens.css`;
feature CSS uses tokens only. The theme is a `data-theme="light|dark"`
attribute on `<html>`: a first visit follows the device setting, and the
🌙/☀️ toggle saves the choice on that device.

| Role | Light | Dark | Use |
|---|---|---|---|
| Brand (army) | `#4A5C2F` | header `#2E3820` | Header bar, primary buttons (white text 7.3:1) |
| Brand dark | `#38471F` | `#243018` | Session bar, pressed states |
| Accent (lime) | `#8FB339` | same | Positive actions, "Add" — **dark text only** (6.9:1; white fails at 2.4:1) |
| Highlight (gold) | `#D4A017` | same | Team 2, "You're up next", level pills, medals (dark text 7.0:1) |
| Danger | `#C0392B` | same | Filled delete / end-session buttons (white 5.4:1) |
| Danger text (`--color-danger-text`) | `#C0392B` | `#F08A7E` | Error text and borders (readable on dark surfaces; filled danger buttons keep `#C0392B`) |
| Link (`--color-link`) | `#4A5C2F` | `#8FB339` | Text links (army green is 2.4:1 on dark) |
| QR / logo bg (`--color-qr-bg`, `--color-logo-bg`) | `#FFFFFF` | `#FFFFFF` | QR code and logo badge backgrounds, both themes |
| Page / card / card 2 | `#F5F6F0` / `#FFFFFF` / `#F0F2EA` | `#1A1C14` / `#252819` / `#2E3220` | Backgrounds |
| Text / text 2 / muted | `#1C1F14` / `#3A3F2A` / `#636A4D` | `#EEF0E8` / `#CDD1BE` / `#9AA380` | Text (muted ≥ 4.6:1 both themes; v1's `#6B7254` / `#8A9470` measured 4.47:1 / 4.11:1 on secondary surfaces, just under AA) |
| Line | `#D8DDD0` | `#3A3F2A` | Borders |
| Pale tint | `#EEF2E6` | `#2A3318` | Present/playing rows, hovers |

- **Type:** Montserrat only (400–900), base 15 px; headings 800; scores and
  timers use tabular numbers.
- **Logo:** v1's mascot badge as a web-sized copy (`assets/logo-512.png`) in
  the header's round white badge and on the sign-in card; v1's `favicon.png`
  is the browser/home-screen icon.
- **Shape:** 10 px radius, soft card shadows, sticky army header, pill buttons
  for small actions.
- **Teams:** Team 1 = army green, Team 2 = gold.
- **Toasts:** the default toast sits on army dark `#38471F`.

**UI-friendly rules (all screens):** tap targets ≥ 44 px (inputs 48 px);
body text ≥ 15 px; labels/meta ≥ 11 px; visible focus rings; errors inline under the field (not only
toasts) and focus moves to the first error; busy buttons say what they're
doing and can't be double-submitted; every empty or error screen offers a next
step; layouts work from 320 px phones up; reduced-motion respected.

**Sign-in** mirrors v1's login card: theme toggle, logo, "Paddle District",
"PICKLEBALL COMMUNITY · VERSION 2", a one-line pitch, and a white "Continue
with Google" button with the Google mark — no email form.

## 8. Security rules (summary)

Match by Auth **uid** only — never `email_verified`.

| Data | Rule |
|---|---|
| `users/{uid}` | Create/update: `uid == auth.uid`. "Signed in" means signed in with Google: rules check `request.auth.token.firebase.sign_in_provider == 'google.com'`. `displayName` must contain a non-space; `photoURL` must be empty or a `https://*.googleusercontent.com/` URL; `displayName` rejects invisible/direction-control characters. Read: single `get`, or a list capped at 25 per query (`limit <= 25`). |
| `handles/{h}` | Create only if absent and `uid == auth.uid` (signed in with Google, `sign_in_provider == 'google.com'`); no update/delete. |
| `sessions/{sid}` | **Public read.** Create: signed in with `ownerId == auth.uid` and `organizerIds == [auth.uid]`. Update: organizers; changes to `ownerId`/`organizerIds` owner-only. Delete: owner. |
| `…/participants/{pid}` | Read: signed in. Player creates/updates **own** (`pid == auth.uid`, `isGuest == false`, status in here/break/left) while `status == live`. Organizers: any, incl. guests (only if `guestsAllowed`). |
| `…/queueEntries/{eid}` | Read: signed in. Player creates entries containing themselves; partners may only append themselves to `accepted`; creator may cancel. Organizers: any. |
| `…/live/state` | Public read. Write: organizers only. |
| `…/matches/{mid}` | Public read. Create: organizers. Match player: `playing → submitted` with `submittedBy == auth.uid`. Opponent of submitter: `submitted → confirmed\|disputed`. Organizers: override any. |
| `results/{rid}` | Read: signed in. Create: organizers of `sessionId`. **No update/delete.** |
| Ended session | All player writes denied until an organizer sets `status: live` (Continue). |

## 9. Errors & offline

- Firestore **persistent local cache** on; writes queue offline and sync later;
  a sync dot shows saved / syncing / offline. Every write stamps `clientAt`.
- No host → "Queue paused" banner (§5.6).
- First-time profile setup needs a connection (its batch is awaited); a new player's unconfirmed local profile write doesn't count until the server confirms it, so a rejected handle never bounces the app off the setup screen. If the profile can't load (an error, or still loading after 10 s) the app shows a "Can't reach Paddle District" screen with Try again and Sign out.
- Duplicates: deterministic solo entry ids; engine keeps the earliest entry if a
  player appears in more than one.
- Player leaves mid-game → court continues; organizer swaps. Player leaves while
  queued → removed from queue.
- Score input: integers 0–99. Unusual scores (0–0, win by 1) warn but don't
  block; a tie = no winner.
- Engine exceptions on the host are caught, logged, and shown to organizers as a
  toast; the last good `live/state` stays in place.

## 10. Architecture & files

Follows AGENTS.md (vanilla ES modules, no build, `html` tag, `view:teardown`).

- **Pure, node-tested (`lib/`):** `queue-engine.js`, `team-balance.js`,
  `score-flow.js` (state transitions + validation), `session-stats.js`,
  `handle.js` (handle validation/normalization), `results.js`.
- **Services (`lib/`):** `firebase.js` (init; live by default on localhost, emulators with `?emulators`, via pure `data-mode.js`),
  `auth.js`, `profiles.js`, `sessions.js` (watchers + intent writes),
  `host.js` (lease, heartbeat, runs `step`, writes batches).
- **Features (`features/`):** `signin`, `setup`, `home`, `me`, `profile`,
  `new-session`, `join`, `session` (player + organizer views), `tv`.
- **Firebase config:** `firestore.rules`, `firestore.indexes.json`,
  `firebase.json` (Hosting ignore list per AGENTS.md lessons).

## 11. Testing

- **`npm test`** — engine (both modes × three court rules; groups that don't
  fit; winners-stay cap; ties; leavers; 5-player edge cases), team balancing,
  score-flow transitions, session stats, handle validation, router.
- **Rules emulator suite** in `rules-tests/` (own `package.json`): cross-session
  attacks, player writing `live/state`, confirming own team's score, editing
  `results`, co-organizer removing owner, player adding a guest, writes to an
  ended session — all **denied**; normal flows **allowed**.
- **Local dev** uses the live project by default (rules tests and automated browser checks use the emulators via `?emulators`).
- **Multi-device localhost check** with Playwright: separate contexts for 8
  players + host + TV; close the host and verify takeover.

## 12. Setup prerequisites

- Create a **new GitHub repo** for Paddle District and add it as `origin`.
- Create a **new Firebase project** (Auth: Google provider; Firestore; Hosting);
  add the Hosting domain to Auth **authorized domains**.
- `lib/firebase-config.js` stays gitignored; commit only the example.
- Local development uses the live project by default (needs the gitignored `lib/firebase-config.js`); `?emulators` switches to the throwaway emulator sandbox (`demo-paddle-district`). Caveat: actions on localhost in live mode are real (e.g. @handles can never be deleted).

Creating the repo and the Firebase project are outward-facing and done only with the user's explicit go-ahead.
