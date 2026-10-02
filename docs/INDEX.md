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
| Game rules (pure) | `handle`, `score-flow`, `session-stats`, `team-balance`, `results` in `lib/`, each with `tests/*.test.js`. | the module headers |
| Layout | `index.html` → `lib/app.js` (hash router); `features/<name>/` UI; `lib/` services + pure logic; `styles/` tokens. | `AGENTS.md` → Architecture |
| Rendering | `html` tagged template auto-escapes every `${}`; guard test blocks bare arrays → `innerHTML` and direct `escapeHtml` imports. | `lib/html.js`, `tests/html-usage.test.js` |
| Run / test | `npm run serve` (localhost:5174); `npm test`. | `AGENTS.md` → Run / test |
| Carried-over lessons | Deploy via CLI, rules emulator tests, uid-not-email rules, hosting ignore list, offline-tolerant writes. | `AGENTS.md` → Lessons |
| Inspiration | `../paddle-district` — open-play session, courts, queue, live view + QR, rankings (Firebase, static pages). | sibling repo — **inspiration only; separate system, nothing shared** |

## Features (`features/<name>/`)

| Feature | What it does | Spec / plan |
|---|---|---|
| `home` | Placeholder landing proving the scaffold works. Replace with the first real screen. | — |

## Specs (`docs/superpowers/specs/`)

| Date | Spec | Summary |
|---|---|---|
| 2026-10-03 | [Profiles & live queue](superpowers/specs/2026-10-03-profiles-and-live-queue-design.md) | Spec 1 (sub-projects #1 + #3): Google-verified profiles, per-session organizers, one queue engine (fairness / stacking + court rules), submit→confirm scores, host-device lease, public TV view, append-only results log. **Draft — awaiting review.** |

## Plans (`docs/superpowers/plans/`)

| Date | Plan | Summary |
|---|---|---|
| 2026-10-03 | [Core game logic](superpowers/plans/2026-10-03-core-game-logic.md) | Spec 1 · Plan 1/3 — pure `lib/` rules: handles, score flow, session stats, team balance, queue engine, results log. |
| 2026-10-03 | [Profiles & Firebase foundation](superpowers/plans/2026-10-03-profiles-firebase-foundation.md) | Spec 1 · Plan 2/3 — emulator-first Firebase, rules + emulator suite, sign-in, profiles, player card. |

## Key decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-03 | Same zero-build vanilla-JS setup as inventory-tracking-system. | Proven conventions, no framework churn, easy for agents to follow. |
| 2026-10-03 | Backend = Firebase (Auth + Firestore + Hosting) in a **new** project; new GitHub repo. | Proven lessons; free tier; offline cache. |
| 2026-10-03 | **Host-device** runs the pure queue engine; players write intents only. | No conflicting writes without Cloud Functions; engine can move server-side later unchanged. |
| 2026-10-03 | Product split into 4 sub-projects: #1 profiles, #2 clubs & events, #3 live queue, #4 stats/rating/community. | Too big for one spec; #1+#3 first. |
| 2026-10-03 | Verified = signed in with Google; phone/club/rating badges deferred to "Pro". | Keep v1 simple. |
| 2026-10-03 | In-house DUPR-style margin-based rating (in #4), fed by append-only `results`. | DUPR partnership too hard for now. |
| 2026-10-03 | Brand palette: greens #273635 #384d3e #4e5650 #577047 #5d814c + accent #c9d64a. | User-chosen brand. |
