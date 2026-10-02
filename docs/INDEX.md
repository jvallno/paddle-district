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
| Layout | `index.html` → `lib/app.js` (hash router); `features/<name>/` UI; `lib/` services + pure logic; `styles/` tokens. | `AGENTS.md` → Architecture |
| Rendering | `html` tagged template auto-escapes every `${}`; guard test blocks bare arrays → `innerHTML` and direct `escapeHtml` imports. | `lib/html.js`, `tests/html-usage.test.js` |
| Run / test | `npm run serve` (localhost:5174); `npm test`. | `AGENTS.md` → Run / test |
| Carried-over lessons | Deploy via CLI, rules emulator tests, uid-not-email rules, hosting ignore list, offline-tolerant writes. | `AGENTS.md` → Lessons |
| Inspiration | `../paddle-district` — open-play session, courts, queue, live view + QR, rankings (Firebase, static pages). | sibling repo |

## Features (`features/<name>/`)

| Feature | What it does | Spec / plan |
|---|---|---|
| `home` | Placeholder landing proving the scaffold works. Replace with the first real screen. | — |

## Specs (`docs/superpowers/specs/`)

| Date | Spec | Summary |
|---|---|---|
| — | *(none yet — product brainstorm next)* | |

## Plans (`docs/superpowers/plans/`)

| Date | Plan | Summary |
|---|---|---|
| — | *(none yet)* | |

## Key decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-03 | Same zero-build vanilla-JS setup as inventory-tracking-system. | Proven conventions, no framework churn, easy for agents to follow. |
| — | Backend (likely Firebase, like paddle-district) | **Open** — decide during brainstorm. |
