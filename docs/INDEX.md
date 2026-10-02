# Knowledge Index — read this first

The map of everything we know and have built. **Check here before searching docs
or code** — each row says *what it is* and *where the real detail lives*.

> **Maintenance rule:** whenever you add or materially change a spec, plan,
> feature, or key decision, add/update its one line here in the same change.
> Keep entries to one line. Last updated: 2026-10-03.

---

## Architecture & core knowledge

| Topic | One-liner | Detail lives in |
|---|---|---|
| Stack | Vanilla JS ES modules, **no build step**; CDN imports; node `--test` for pure logic. | `AGENTS.md` → Stack & ground rules |
| Queue engine | `step()` in `lib/queue-engine.js` — pure; derives courts from `matches`, fills free courts per mode (fairness/stacking) and court rule; host commits its output. | `lib/queue-engine.js` header, spec §5 |
| Game rules (pure) | `handle`, `profile-input`, `route-access`, `avatar`, `session`, `score-flow`, `session-stats`, `team-balance`, `results`, `theme-choice`, `data-mode`, `app-url` in `lib/`, each with `tests/*.test.js`. | the module headers |
| Layout | `index.html` → `lib/app.js` (hash router); `features/<name>/` UI; `lib/` services + pure logic; `styles/` tokens. | `AGENTS.md` → Architecture |
| Rendering | `html` tagged template auto-escapes every `${}`; guard test blocks bare arrays → `innerHTML` and direct `escapeHtml` imports. | `lib/html.js`, `tests/html-usage.test.js` |
| Auth & routing | `lib/app.js` watches auth + profile → `lib/session.js`; `resolveRoute()` decides signin/setup/ready screens; signed-out deep links resume after sign-in. | `lib/route-access.js`, `lib/session.js` |
| Firebase locally | localhost → LIVE data by default; `?emulators` → sandbox (`demo-paddle-district`, `npm run emulators`); corner badge; rules suite `npm run test:rules`. | `lib/data-mode.js`, `lib/firebase.js`, `rules-tests/` |
| Run / test | `npm run serve` (localhost:5174, live data; add `?emulators` + `npm run emulators` for sandbox); `npm test`; `npm run test:rules`. | `AGENTS.md` → Run / test |
| Brand & theme | v1 look: tokens (light + dark) in styles/tokens.css; lib/theme-choice.js (pure) + lib/theme.js; inline pre-paint script in index.html; assets/ (logo-512, favicon). | spec §7 |
| Carried-over lessons | Deploy via CLI, rules emulator tests, uid-not-email rules, hosting ignore list, offline-tolerant writes. | `AGENTS.md` → Lessons |
| Live server | https://paddle-district-v2.web.app — Firebase project `paddle-district-v2` (user-owned; Firestore `asia-southeast1`; Google sign-in). Deploy via CLI on explicit request only. | `AGENTS.md` → v2 note, `.firebaserc` |
| v1 (original app) | Paddle District v1 — static pages: open-play session, courts, queue, live view + QR, rankings (Realtime Database, original owner's Firebase project). | `v1` branch / `v1.0` tag of this repo / `../paddle-district` — **inspiration only; v2 shares no code or data** |

## Features (`features/<name>/`)

| Feature | What it does | Spec / plan |
|---|---|---|
| `signin` | Google sign-in (verified = signed in). | `features/signin/`, `lib/auth.js` |
| `setup` | First-time profile: name, unique @handle (live availability), self-rating. | `features/setup/`, `lib/profiles.js` |
| `me` | Player card with QR (→ `#/u/{handle}`), edit name/level, sign out. | `features/me/`, `lib/qr.js` |
| `profile` | Public profile `#/u/{handle}`. | `features/profile/` |
| `home` | Placeholder until Plan 3's My Sessions. | `features/home/` |

## Specs (`docs/superpowers/specs/`)

| Date | Spec | Summary |
|---|---|---|
| 2026-10-03 | [Profiles & live queue](superpowers/specs/2026-10-03-profiles-and-live-queue-design.md) | Spec 1 (sub-projects #1 + #3): Google-verified profiles, per-session organizers, one queue engine (fairness / stacking + court rules), submit→confirm scores, host-device lease, public TV view, append-only results log. **Draft — awaiting review.** |

## Plans (`docs/superpowers/plans/`)

| Date | Plan | Summary |
|---|---|---|
| 2026-10-03 | [Step 1 — Rebrand](superpowers/plans/2026-10-03-rebrand-v1-look.md) | v1 branding + UI-friendly rules on existing screens. |
| 2026-10-03 | [Core game logic](superpowers/plans/2026-10-03-core-game-logic.md) | Spec 1 · Plan 1/3 — pure `lib/` rules: handles, score flow, session stats, team balance, queue engine, results log. |
| 2026-10-03 | [Profiles & Firebase foundation](superpowers/plans/2026-10-03-profiles-firebase-foundation.md) | Spec 1 · Plan 2/3 — emulator-first Firebase, rules + emulator suite, sign-in, profiles, player card. |

## Key decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-03 | Renamed to **Paddle District** (v2); code lives in the fork `jvallno/paddle-district`; v2 became the fork's `main` on 2026-10-03 (v1 preserved as branch `v1` / tag `v1.0`; the original sites-9400 repo is never touched). Environments: **local** (live data by default; `?emulators` sandbox) and **live** (`paddle-district-v2`, user-owned). | Continue the Paddle District name; keep v1 running until switch-over; never touch the original owner's Firebase project. |
| 2026-10-03 | Same zero-build vanilla-JS setup as inventory-tracking-system. | Proven conventions, no framework churn, easy for agents to follow. |
| 2026-10-03 | Backend = Firebase (Auth + Firestore + Hosting) in a **new** project; new GitHub repo. | Proven lessons; free tier; offline cache. |
| 2026-10-03 | **Host-device** runs the pure queue engine; players write intents only. | No conflicting writes without Cloud Functions; engine can move server-side later unchanged. |
| 2026-10-03 | Product split into 4 sub-projects: #1 profiles, #2 clubs & events, #3 live queue, #4 stats/rating/community. | Too big for one spec; #1+#3 first. |
| 2026-10-03 | Verified = signed in with Google; phone/club/rating badges deferred to "Pro". | Keep v1 simple. |
| 2026-10-03 | In-house DUPR-style margin-based rating (in #4), fed by append-only `results`. | DUPR partnership too hard for now. |
| 2026-10-03 | ~~Brand palette greens #273635…~~ → **superseded**: v2 keeps **v1's branding** (mascot logo, Montserrat, army #4A5C2F / lime #8FB339 / gold #D4A017, light/dark toggle). | User wants Paddle District to look like v1; spec §7. |
| 2026-10-03 | Accounts optional with nudging: v1's name-only roster + self check-in stay; signed-in players get profiles; organizers can link a name to a profile. Google is the only sign-in. | Keep v1's zero-friction check-in while moving players onto profiles. |
| 2026-10-03 | v2 = every v1 feature + new ones. Order: Step 1 rebrand → Plan 3 sessions (with v1 parity) → clubs/events → ratings/community, step by step with a localhost check and deploy on request. | Smooth, incremental rollout. |
| 2026-10-03 | Localhost uses LIVE data by default (like inventory-tracking-system); `?emulators` = sandbox; corner badge shows which. | User wants real data locally; sandbox kept for safe experiments and automated checks. |
| 2026-10-03 | @handle fixed after creation; Google photo, no upload; badges denied by rules until "Pro". | Keep v1 simple; uniqueness stays trivially correct. |
