# AGENTS.md — Orientation for AI agents & contributors

Paddle District (v2): a web app for pickleball open play built around a **paddle
queueing system** (fairness rotation or paddle stacking, chosen per session)
with Reclub-style community features. Design lives in
`docs/superpowers/specs/` — start with Spec 1 (profiles & live queue).

**v2 is a rebuild of the original Paddle District (v1)**: the multi-page static
app (`app.html` open-play session, `view.html` public live view with QR,
`dashboard.html` sessions), preserved on this repo's `v1` branch / `v1.0` tag and in the sibling
checkout `../paddle-district`. v1 is inspiration for the court/queue mechanics
only — **v2 shares no code, Firebase project, users, or data with v1** (v1 uses
the original owner's Firebase project; v2 uses its own live project
`paddle-district-v2`). Repo: `jvallno/paddle-district` (a fork); v2 is `main` (since 2026-10-03); new work branches off `main`/`next` and merges back by PR **inside the fork**. Never push or open PRs to the original `sites-9400/paddle-district`.

**Two environments only:** local (live data by default; `?emulators` sandbox) and live
(https://paddle-district-v2.web.app). Deploy from the CLI, only on an explicit
request: `npx --prefix rules-tests firebase deploy --only firestore:rules` /
`--only hosting` (hosting's predeploy refuses without the gitignored
`lib/firebase-config.js`). Afterwards read the rules back and diff served files.

> **📍 Check [docs/INDEX.md](docs/INDEX.md) first.** It's the one-page map of every
> spec, plan, feature, and key decision — scan it before searching docs or code,
> and add a line there whenever you add or change one.

## Stack & ground rules

- **Vanilla JavaScript, ES modules, no build step.** No framework, bundler, or
  transpiler. The browser loads `index.html` → `/lib/app.js` directly.
- Third-party code comes from CDNs as ES modules (Firebase from `gstatic`,
  pinned to one version across all imports; others from `jsdelivr`/`cdnjs`).
- Brand: **v1's Paddle District look** — Montserrat only, army/lime/gold tokens
  with light + dark themes, mascot logo (spec §7). Never hard-code colors.
- Do **not** add a build tool, TypeScript, or a package-manager dependency for
  the app itself without a strong reason — zero-build simplicity is a feature.
  Test-only tooling lives in its own folder with its own `package.json`.

## Run / test

```bash
npm run emulators   # Firebase auth + Firestore emulators (demo-paddle-district) — needs Java 21+
npm run serve       # python3 serve.py 5174 → http://localhost:5174 (no-cache), LIVE data (paddle-district-v2)
                    # http://localhost:5174/?emulators → throwaway sandbox on the emulators
npm test            # node --test → unit tests for the pure lib/ modules
npm run test:rules  # Firestore security-rules suite on the emulator
```

First time: `npm --prefix rules-tests install`. Java: if `java -version` fails,
`rules-tests/with-java.sh` uses a user-space JDK in `~/.local/jdk` (see Plan 2,
Task 2, Step 0). On localhost the app uses **LIVE data by default** (project
`paddle-district-v2`; needs the gitignored `lib/firebase-config.js`); add `?emulators`
to use the emulator sandbox. A corner badge shows "LIVE DATA" or "Sandbox · emulators".
**Caveat:** anything done on localhost in live mode is real (e.g. @handles can never
be deleted). Develop unmerged schema/engine changes with `?emulators`: in live mode, local code writes to production. On localhost in live mode, writes made while offline are queued in IndexedDB and replay to production on the next live-mode load. Only `localhost`/`127.0.0.1` count as local — opening the dev server by LAN IP or [::1] uses live data with no badge, and `?emulators` is ignored.
Rules tests always use the emulator; automated browser checks must use `?emulators`.

Always run `npm test` (and `npm run test:rules` after any `firestore.rules`
change) before claiming a change is done. Verify on **localhost first**; only
deploy on an explicit go-ahead.

## Architecture

```
index.html          # shell: loads every stylesheet + /lib/app.js
lib/                # shared services + PURE logic (node-tested)
features/<name>/    # self-contained UI features: <name>.js (init) + <name>.css
assets/            # logo-512.png, favicon.png (from v1)
styles/             # tokens.css (design vars) + base/modal/toast css
tests/              # node --test suites for the pure lib/ modules
docs/superpowers/   # specs/ (design) and plans/ (implementation) per feature
```

### `lib/` — two kinds of module

- **Pure logic** (no DOM, no Firebase): `escape`, `html`, `router.parseHash`, `handle`, `score-flow`, `session-stats`, `team-balance`, `queue-engine`, `results`, `profile-input`, `route-access`, `avatar`, `session`, `theme-choice` (light/dark choice), `data-mode` (live vs emulators), `app-url` (links that keep the sandbox flag).
  **These have `tests/*.test.js` and must stay import-free of DOM/Firebase** so
  they run under `node --test`. Put all game/queue/ranking rules here and test
  them — that's where the bugs hide.
- **Browser / services** (touch the DOM or a backend): `app` (auth → session → guarded routes),
  `router.createRouter`, `firebase`, `auth`, `profiles`, `qr`, `toast`, `confirm`, `theme`.

### `features/<name>/` — the UI convention

```js
export function init(container, param) { /* render into container, wire events */ }
```

- Render with the auto-escaping `html` tag from `lib/html.js`:
  ``container.innerHTML = html`<td>${player.name}</td>` ``. Every `${value}` is
  escaped unless it's a nested `html` fragment or `raw()` (trusted constant
  markup only — never data). Arrays join automatically (no `.join('')`), but
  **never assign a bare array to `innerHTML`** (the browser comma-joins it):
  ``el.innerHTML = html`${list.map(...)}` ``. `tests/html-usage.test.js` enforces
  this and blocks direct `escapeHtml` imports.
- **Clean up** on navigation: register a one-shot `view:teardown` listener that
  unsubscribes snapshots / clears timers:
  `container.addEventListener('view:teardown', unsub, { once: true });`
- Co-locate CSS as `features/<name>/<name>.css` and add a `<link>` in `index.html`.
- Use `showToast` / `showConfirm` (`lib/toast.js`, `lib/confirm.js`), not
  `alert` / `confirm`.
- Colors, spacing, radii come from `styles/tokens.css` variables only.

### Routing

Hash router (`lib/router.js`). Register routes in `lib/app.js`; unknown or empty
hashes fall back to `home`. `createRouter` returns `stop()` — call it before
re-rendering the shell (e.g. on sign-out) so a stale guard can't hijack
navigation.

## Adding a feature (recipe)

1. Put testable logic in `lib/<thing>.js` (pure) + `tests/<thing>.test.js`.
2. Create `features/<name>/<name>.js` exporting `init(container)`; add
   `features/<name>/<name>.css` and a `<link>` in `index.html`.
3. Register the route in `lib/app.js`.
4. Subscribe to live data via watcher functions; clean up on `view:teardown`.
5. `npm test`, then verify in the browser (`npm run serve`).
6. Add/update the feature's line in `docs/INDEX.md`.

## Lessons carried over from inventory-tracking-system

Learned the hard way there; apply from day one here.

- **Secrets:** `lib/firebase-config.js` is gitignored; commit only
  `lib/firebase-config.example.js`.
- **Security rules are the real boundary.** UI checks are cosmetic. Any
  `firestore.rules` change gets an emulator test suite (cross-tenant attacks
  denied, normal flows allowed) before deploy — set it up with the first rule.
- **Never key rules on `email_verified`** for an account that links a password
  credential (it resets to false); match by Auth **uid**.
- **Deploy from the CLI** in the repo dir (`npx firebase-tools deploy --only …`).
  The Firebase MCP deploy tool has pushed stale files before. Verify after
  deploying by fetching a served file and diffing it.
- **Hosting `ignore` list** must exclude `.git/**`, `.claude/**`, `docs/**`,
  `tests/**`, dotfiles, etc. (`public: "."` once exposed `.git` publicly).
- A new Hosting domain must be added to Firebase Auth **authorized domains** or
  sign-in fails with `auth/unauthorized-domain`.
- **Offline-tolerant writes:** use `writeBatch` + fire-and-forget commits and
  `increment()`; don't `await` server acks or use `runTransaction` for actions
  that must work on flaky court-side Wi-Fi. Stamp `clientAt` (device time).
- Append-only logs (match results, queue history) are never edited in place —
  write a correcting entry instead.
