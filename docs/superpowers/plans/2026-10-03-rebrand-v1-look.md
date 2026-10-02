# Step 1 — Rebrand to v1's Paddle District look (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give v2's existing screens Paddle District v1's branding — mascot logo, Montserrat, army/lime/gold palette, light/dark toggle, v1-style sign-in card — plus the UI-friendly rules (44 px targets, inline errors, focus on first error), with no change to features, data or security rules.

**Architecture:** All color/typography changes live in `styles/tokens.css` (light + dark sets on `<html data-theme>`), so features keep using tokens. A pure `lib/theme-choice.js` decides the theme (node-tested); `lib/theme.js` applies/toggles it in the browser; an inline script in `index.html` applies the same rule before first paint (no flash). Screens are restyled in their own CSS; JS changes are limited to the header, sign-in card, home copy, gold pills and focusing the first error.

**Tech Stack:** Vanilla JS ES modules (no build), Montserrat from Google Fonts, `node --test`, macOS `sips` for the one-time logo resize.

**Spec:** `docs/superpowers/specs/2026-10-03-profiles-and-live-queue-design.md` §7 (Brand & visual system), §2 (v1 parity / brand rows)

**Branch:** `feat/rebrand` (stacked on `feat/profiles`).

## Global Constraints

- Colors only via `styles/tokens.css` variables (spec §7). Brand values: army `#4A5C2F`, army dark `#38471F`, lime `#8FB339` (dark text only), gold `#D4A017`, danger `#C0392B`; light page `#F5F6F0`, dark page `#1A1C14`.
- Every text/background pair used meets WCAG AA 4.5:1 in **both** themes (values in tokens.css were measured; don't change them without re-measuring).
- Montserrat only; no other font families.
- Tap targets ≥ 44 px (`--tap`), inputs ≥ 48 px; errors inline under fields; focus moves to the first invalid field on submit.
- QR codes always render on white (`--color-qr-bg`) — scanners need it in dark mode too.
- No changes to `firestore.rules`, data shapes, or feature behaviour. `npm test` and `npm run test:rules` stay green.
- Commits: one per task, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, no deploy (Task 5 is controller-only, on the user's go-ahead).

## Review Focus

1. **Dark mode legibility** — every screen in dark mode: text, muted text, links, pills, the QR (must stay scannable on white), the logo (on its white badge). → Task 3 Step 4 checks D1–D3.
2. **Theme flash / persistence** — first visit follows the device; a toggled choice survives reload and applies before first paint (no light flash on dark). → Task 1 tests + Task 3 check T1–T2.
3. **Narrow phones** — 320 px: no horizontal scroll; header title fits. → Task 3 check N1.
4. **Stale handle status** — "@x is available" must never sit under a newer, different value. → Task 3 check S1.
5. **Local dev server drops ES-module requests** — Python's default backlog (5) resets connections when the browser loads many modules at once; the app then shows "Couldn't start". → Task 1 serve.py fix + Task 3 check L1 (three cold loads in a row).

## Spec deltas this plan introduces

- `serve.py` uses a 128-connection backlog (dev only).
- New token `--color-link` (army in light, lime in dark) — army-green links are unreadable on dark backgrounds (2.4:1).
- New token `--color-qr-bg` (#FFFFFF in both themes).
- Light muted text is `#636A4D` and dark muted `#9AA380` (v1's `#6B7254` / `#8A9470` measured 4.47:1 and 4.11:1 on secondary surfaces — just under AA).
- Review fixes: --color-danger-text for dark-mode errors; default toast on army dark; brand surfaces tokenized (--color-logo-bg, --color-google-bg/ink); .btn--sm ≥ 44 px; dead .import-* modal rules removed.
- Final review: --color-focus for focus rings/borders; appUrl() keeps ?emulators in generated links; logo-96 for the header; error live regions stay rendered; body ≥ 15 px, labels ≥ 11 px.
- Localhost uses live data by default; ?emulators sandbox (lib/data-mode.js, b92d0be).

---

### Task 1: Theme choice logic + dev server fix

**Files:**
- Create: `lib/theme-choice.js`, `tests/theme-choice.test.js`
- Modify: `serve.py`

**Interfaces:**
- Produces: `THEMES`, `THEME_KEY = 'pd:theme'`, `initialTheme(saved, prefersDark) → 'light'|'dark'`, `nextTheme(current)`, `toggleLabel(current) → { icon, label }`.

- [ ] **Step 1: Write the failing test**

Create `tests/theme-choice.test.js`:

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTheme, nextTheme, toggleLabel, THEMES, THEME_KEY } from '../lib/theme-choice.js';

test('a saved theme wins over the device setting', () => {
  assert.equal(initialTheme('light', true), 'light');
  assert.equal(initialTheme('dark', false), 'dark');
});

test('without a valid saved theme, follow the device', () => {
  assert.equal(initialTheme(null, true), 'dark');
  assert.equal(initialTheme(undefined, false), 'light');
  assert.equal(initialTheme('purple', true), 'dark');
});

test('nextTheme flips between the two themes', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('weird'), 'dark');
});

test('the toggle offers the other theme', () => {
  assert.deepEqual(toggleLabel('light'), { icon: '🌙', label: 'Switch to dark theme' });
  assert.deepEqual(toggleLabel('dark'), { icon: '☀️', label: 'Switch to light theme' });
});

test('constants', () => {
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.equal(THEME_KEY, 'pd:theme');
});
````

- [ ] **Step 2: Run it and verify it fails**

Run: `node --test tests/theme-choice.test.js` — Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement**

Create `lib/theme-choice.js`:

````js
// Light/dark theme choice (spec §7). Pure — node-tested. The inline script in
// index.html applies the same rule before first paint so there's no flash;
// keep the two in step.
export const THEMES = ['light', 'dark'];
export const THEME_KEY = 'pd:theme';

// A saved valid choice wins; otherwise follow the device setting.
export function initialTheme(saved, prefersDark) {
  if (THEMES.includes(saved)) return saved;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

// Label and icon for the toggle button: it offers the *other* theme.
export function toggleLabel(current) {
  return current === 'dark'
    ? { icon: '☀️', label: 'Switch to light theme' }
    : { icon: '🌙', label: 'Switch to dark theme' };
}
````

Replace the whole file `serve.py`:

````python
#!/usr/bin/env python3
"""Static dev server for localhost that disables caching, so edits to JS/CSS
show up on a normal reload instead of being served stale from the browser
cache. Usage: python3 serve.py [port]  (default 5173)."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Expires", "0")
        super().end_headers()


class DevServer(ThreadingHTTPServer):
    # The browser requests many ES modules at once; the default backlog of 5
    # makes it drop connections (ERR_CONNECTION_RESET) and the app never boots.
    request_queue_size = 128


if __name__ == "__main__":
    with DevServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Serving paddle-district on http://localhost:{PORT} (no-cache)")
        httpd.serve_forever()
````

- [ ] **Step 4: Verify**

Run: `node --test tests/theme-choice.test.js` → PASS (5). Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/theme-choice.js tests/theme-choice.test.js serve.py
git commit -m "feat(theme): light/dark choice logic; dev server backlog for ES modules"
```

### Task 2: Brand foundation — assets, tokens, base styles, page shell, theme runtime

**Files:**
- Create: `assets/logo-512.png`, `assets/favicon.png` (from v1), `lib/theme.js`
- Modify (full replacements below): `styles/tokens.css`, `styles/base.css`, `index.html`

**Interfaces:**
- Consumes: Task 1's `lib/theme-choice.js`.
- Produces: `currentTheme()`, `applyTheme(theme)`, `themeToggleHtml(extraClass?)`, `wireThemeToggles(container)` from `lib/theme.js`; tokens `--color-header`, `--color-header-2`, `--color-link`, `--color-tint`, `--color-input`, `--color-highlight`, `--color-highlight-ink`, `--color-text-2`, `--color-qr-bg`, `--tap`, `--font`; classes `.btn--accent`, `.btn--block`, `.theme-toggle`, `.eyebrow`, `.card__title`, `.pill--gold`, `.num`, `.boot__logo`. **`.pill--accent` is removed** (Task 3 switches its two uses to `.pill--gold`).

- [ ] **Step 1: Assets from v1** (v1 lives on the fork's `main`)

```bash
git fetch origin main
mkdir -p assets
git show origin/main:logo.png > /tmp/pd-logo.png && sips -Z 512 /tmp/pd-logo.png --out assets/logo-512.png
git show origin/main:favicon.png > assets/favicon.png
sips -g pixelWidth assets/logo-512.png   # expect 512
```

- [ ] **Step 2: Theme runtime**

Create `lib/theme.js`:

````js
// Applies and toggles the light/dark theme (browser only). The choice lives on
// <html data-theme> and is saved per device (localStorage can be unavailable).
import { THEME_KEY, initialTheme, nextTheme, toggleLabel } from './theme-choice.js';
import { html } from './html.js';

const THEME_COLOR = { light: '#4A5C2F', dark: '#2E3820' }; // = header bar per theme (tokens.css)

export function currentTheme() {
  return document.documentElement.dataset.theme
    || initialTheme(null, window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode etc. */ }
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) paintToggle(btn, theme);
}

function paintToggle(btn, theme) {
  const { icon, label } = toggleLabel(theme);
  btn.textContent = icon;
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

// Markup for a toggle button; wire it with wireThemeToggles(container).
export function themeToggleHtml(extraClass = '') {
  const { icon, label } = toggleLabel(currentTheme());
  return html`<button type="button" class="theme-toggle ${extraClass}" data-theme-toggle aria-label="${label}" title="${label}">${icon}</button>`;
}

export function wireThemeToggles(container) {
  for (const btn of container.querySelectorAll('[data-theme-toggle]')) {
    btn.addEventListener('click', () => applyTheme(nextTheme(currentTheme())));
  }
}
````

- [ ] **Step 3: Tokens, base styles, page shell**

Replace the whole file `styles/tokens.css`:

````css
/* Design tokens — Paddle District brand, carried over from v1 (spec §7).
   Change values here, never hard-code colors in feature CSS. The theme is
   <html data-theme="light|dark">, set before first paint by index.html. */
:root {
  /* Brand (same in both themes) */
  --color-primary: #4A5C2F;        /* army: primary buttons, links (white 7.3:1) */
  --color-primary-ink: #38471F;    /* hover/pressed */
  --color-accent: #8FB339;         /* lime: positive actions — dark text only */
  --color-accent-ink: #1C1F14;
  --color-highlight: #D4A017;      /* gold: Team 2, "you're up", level pills */
  --color-highlight-ink: #1C1F14;
  --color-danger: #C0392B;
  --color-success: #4A7C2F;
  --color-warning: #B7791F;
  --color-on-dark: #FFFFFF;        /* text/icons on brand/dark surfaces */
  --color-qr-bg: #FFFFFF;          /* QR codes need a white quiet zone in both themes */

  /* Avatars without a photo (lib/avatar.js avatarIndex → 0…5), white text ≥ 4.5:1 */
  --avatar-0: #4A5C2F;
  --avatar-1: #38471F;
  --avatar-2: #5B6E37;
  --avatar-3: #6B5410;
  --avatar-4: #2F5A4A;
  --avatar-5: #7A3B2E;

  /* Type: Montserrat only (the display/body/mono names stay for older CSS) */
  --font: 'Montserrat', system-ui, -apple-system, sans-serif;
  --font-display: var(--font);
  --font-body: var(--font);
  --font-mono: var(--font);

  /* Spacing / shape */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --radius: 10px;
  --radius-lg: 14px;
  --radius-full: 999px;
  --tap: 44px;                     /* minimum tap target */

  /* Layout */
  --topbar-h: 60px;
  --content-max: 560px;
}

:root, [data-theme="light"] {
  --color-bg: #F5F6F0;
  --color-surface: #FFFFFF;
  --color-surface-2: #F0F2EA;
  --color-text: #1C1F14;
  --color-text-2: #3A3F2A;
  --color-muted: #636A4D;
  --color-faint: #8A9470;
  --color-border: #D8DDD0;
  --color-link: #4A5C2F;
  --color-tint: #EEF2E6;           /* present/playing rows, hovers */
  --color-header: #4A5C2F;
  --color-header-2: #38471F;
  --color-input: #F5F6F0;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 12px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.16);
  color-scheme: light;
}

[data-theme="dark"] {
  --color-bg: #1A1C14;
  --color-surface: #252819;
  --color-surface-2: #2E3220;
  --color-text: #EEF0E8;
  --color-text-2: #CDD1BE;
  --color-muted: #9AA380;
  --color-faint: #6B7254;
  --color-border: #3A3F2A;
  --color-link: #8FB339;
  --color-tint: #2A3318;
  --color-header: #2E3820;
  --color-header-2: #243018;
  --color-input: #1E2115;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 16px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.5);
  color-scheme: dark;
}
````

Replace the whole file `styles/base.css`:

````css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: var(--font);
  font-size: 15px;
  letter-spacing: 0.01em;
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  transition: background 0.2s, color 0.2s;
}
h1, h2, h3 { margin: 0; font-family: var(--font); font-weight: 800; letter-spacing: 0.01em; }
p { margin: 0; }
a { color: var(--color-link); }
.num { font-variant-numeric: tabular-nums; }

.boot { min-height: 100vh; display: grid; place-items: center; align-content: center; gap: var(--space-3); color: var(--color-muted); font-weight: 600; }
.boot__logo { width: 88px; height: 88px; border-radius: 22px; background: #fff; padding: 6px; box-shadow: var(--shadow-md); }

/* Buttons — every button is at least a 44 px tap target */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: var(--tap);
  padding: 10px 18px;
  border-radius: var(--radius);
  border: 1.5px solid transparent;
  font: inherit; font-size: 0.95rem; font-weight: 700;
  cursor: pointer; text-decoration: none;
  transition: transform 0.1s ease, box-shadow 0.12s ease, background 0.12s ease, border-color 0.12s ease;
  white-space: nowrap;
}
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
.btn--primary { background: var(--color-primary); color: var(--color-on-dark); }
.btn--primary:hover { background: var(--color-primary-ink); box-shadow: var(--shadow-md); }
.btn--accent { background: var(--color-accent); color: var(--color-accent-ink); }
.btn--accent:hover { box-shadow: var(--shadow-md); filter: brightness(0.95); }
.btn--secondary { background: var(--color-surface); color: var(--color-text); border-color: var(--color-border); }
.btn--secondary:hover { border-color: var(--color-primary); box-shadow: var(--shadow-sm); }
.btn--ghost { background: transparent; color: var(--color-muted); }
.btn--ghost:hover { background: var(--color-tint); color: var(--color-text); }
.btn--danger { background: var(--color-danger); color: var(--color-on-dark); }
.btn--danger:hover { box-shadow: var(--shadow-md); filter: brightness(0.92); }
.btn:disabled { opacity: 0.6; cursor: default; transform: none; box-shadow: none; }
.btn--sm { min-height: 36px; padding: 6px 14px; font-size: 0.82rem; border-radius: var(--radius-full); }
.btn--block { width: 100%; }

/* Light/dark toggle (pill, as in v1) */
.theme-toggle {
  min-width: var(--tap); min-height: var(--tap);
  display: inline-grid; place-items: center;
  border-radius: var(--radius-full);
  font-size: 1.05rem; line-height: 1; cursor: pointer;
  background: var(--color-surface); border: 1.5px solid var(--color-border); color: var(--color-text);
}
.theme-toggle:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}

/* Page column used by most screens */
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-4) var(--space-3) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.page__title { font-size: 1.5rem; line-height: 1.15; }
.page__sub { color: var(--color-muted); }

.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); box-shadow: var(--shadow-md); }
.card__title { font-size: 1.05rem; }
.eyebrow { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-muted); }

/* Forms — v1-style small uppercase labels, pale 48 px fields */
.field { display: flex; flex-direction: column; gap: 6px; }
.field__label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-muted); }
.field__hint { color: var(--color-muted); font-size: 0.82rem; }
.field__error { color: var(--color-danger); font-size: 0.85rem; font-weight: 600; }
.field__error:empty { display: none; }
.field__error:not(:empty)::before { content: "⚠ "; }
.input {
  font: inherit; font-size: 1rem; color: var(--color-text); background: var(--color-input);
  border: 1.5px solid var(--color-border); border-radius: var(--radius); padding: 11px 14px; width: 100%;
  min-height: 48px;
}
.input:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-accent) 55%, transparent); outline-offset: 1px; border-color: var(--color-primary); }
.input[aria-invalid="true"] { border-color: var(--color-danger); }
.input-prefix { display: flex; align-items: center; border: 1.5px solid var(--color-border); border-radius: var(--radius); background: var(--color-input); }
.input-prefix > span { padding-left: 14px; color: var(--color-muted); font-weight: 700; }
.input-prefix > .input { border: 0; padding-left: 2px; background: transparent; }
.input-prefix:focus-within { border-color: var(--color-primary); outline: 3px solid color-mix(in srgb, var(--color-accent) 55%, transparent); outline-offset: 1px; }
.input-prefix:has(.input[aria-invalid="true"]) { border-color: var(--color-danger); }
.input-prefix > .input:focus-visible { outline: none; }

/* Avatar */
.avatar { width: 40px; height: 40px; border-radius: var(--radius-full); display: inline-grid; place-items: center; overflow: hidden; color: var(--color-on-dark); font-weight: 800; font-size: 0.9rem; flex: none; background: var(--avatar-0); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar--lg { width: 80px; height: 80px; font-size: 1.5rem; }
.avatar--c0 { background: var(--avatar-0); } .avatar--c1 { background: var(--avatar-1); } .avatar--c2 { background: var(--avatar-2); }
.avatar--c3 { background: var(--avatar-3); } .avatar--c4 { background: var(--avatar-4); } .avatar--c5 { background: var(--avatar-5); }

.pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: var(--radius-full); background: var(--color-surface-2); border: 1px solid var(--color-border); font-size: 0.82rem; font-weight: 600; color: var(--color-muted); }
.pill--gold { background: var(--color-highlight); border-color: transparent; color: var(--color-highlight-ink); font-weight: 700; }

.stalled__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
````

Replace the whole file `index.html`:

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#4A5C2F" />
  <title>Paddle District</title>
  <script>
    // Theme before first paint — same rule as lib/theme-choice.js initialTheme().
    (function () {
      var saved = null;
      try { saved = localStorage.getItem('pd:theme'); } catch (e) {}
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = saved === 'light' || saved === 'dark' ? saved : (dark ? 'dark' : 'light');
      document.documentElement.dataset.theme = theme;
      if (theme === 'dark') document.querySelector('meta[name="theme-color"]').setAttribute('content', '#2E3820');
    })();
  </script>
  <link rel="icon" type="image/png" href="/assets/favicon.png" />
  <link rel="apple-touch-icon" href="/assets/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
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
  <div id="boot" class="boot"><img class="boot__logo" src="/assets/logo-512.png" alt="" width="88" height="88"><span>Loading…</span></div>
  <header id="topbar" class="topbar" hidden></header>
  <main id="view"></main>
  <script type="module" src="/lib/app.js"></script>
  <script>
    // Fallback if the app never booted (e.g. missing config or a failed module load).
    setTimeout(function () {
      var boot = document.getElementById('boot');
      if (!boot) return;
      var msg = document.createElement('p');
      msg.textContent = "Couldn't start Paddle District.";
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--primary';
      btn.textContent = 'Reload';
      btn.onclick = function () { location.reload(); };
      boot.textContent = '';
      boot.append(msg, btn);
    }, 15000);
  </script>
</body>
</html>
````

- [ ] **Step 4: Verify**

`npm test` → all pass (html-usage scans `lib/theme.js`). Note: until Task 3 lands, `.pill--accent` is unstyled — that's expected.

- [ ] **Step 5: Commit**

```bash
git add assets/logo-512.png assets/favicon.png lib/theme.js styles/tokens.css styles/base.css index.html
git commit -m "feat(brand): v1 tokens (light+dark), Montserrat, logo/favicon, theme runtime"
```

### Task 3: Restyle the screens

**Files (full replacements below):** `features/topbar/topbar.{js,css}`, `features/signin/signin.{js,css}`, `features/home/home.{js,css}`, `features/setup/setup.{js,css}`, `features/me/me.{js,css}`, `features/profile/profile.{js,css}`, `features/shared/rating-field.js`

**Interfaces:**
- Consumes: Task 2's `lib/theme.js` and tokens/classes.
- Produces: `focusFirstError(form)` in `features/shared/rating-field.js`.

- [ ] **Step 1: Header and sign-in**

Replace the whole file `features/topbar/topbar.js`:

````js
// App header (v1 style), shown once the player has a profile. Rendered by lib/app.js.
import { html } from '../../lib/html.js';
import { avatarHtml } from '../../lib/avatar.js';
import { themeToggleHtml, wireThemeToggles } from '../../lib/theme.js';

export function renderTopbar(el, { status, profile }) {
  el.hidden = status !== 'ready';
  if (status !== 'ready') { el.innerHTML = ''; return; }
  el.innerHTML = html`
    <a class="topbar__brand" href="#/home">
      <span class="topbar__logo"><img src="/assets/logo-512.png" alt="" width="36" height="36"></span>
      <span class="topbar__name">Paddle District</span>
    </a>
    ${themeToggleHtml('theme-toggle--on-dark')}
    <a class="topbar__me" href="#/me" aria-label="My profile">${avatarHtml(profile)}</a>`;
  wireThemeToggles(el);
}
````

Replace the whole file `features/topbar/topbar.css`:

````css
.topbar {
  position: sticky; top: 0; z-index: 50;
  min-height: var(--topbar-h);
  display: flex; align-items: center; gap: var(--space-2);
  padding: 8px var(--space-3);
  background: var(--color-header); color: var(--color-on-dark);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}
.topbar[hidden] { display: none; }
.topbar__brand { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; color: var(--color-on-dark); text-decoration: none; min-height: var(--tap); }
.topbar__brand:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; border-radius: var(--radius); }
.topbar__logo { width: 40px; height: 40px; flex: none; border-radius: var(--radius-full); background: #fff; display: grid; place-items: center; overflow: hidden; }
.topbar__logo img { width: 36px; height: 36px; object-fit: contain; }
.topbar__name { font-weight: 800; font-size: 1.1rem; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.theme-toggle--on-dark { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.25); color: var(--color-on-dark); }
.theme-toggle--on-dark:hover { background: rgba(255, 255, 255, 0.22); }
.topbar__me { display: inline-grid; place-items: center; min-width: var(--tap); min-height: var(--tap); border-radius: var(--radius-full); }
.topbar__me:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
.topbar .avatar { width: 36px; height: 36px; font-size: 0.8rem; box-shadow: 0 0 0 2px var(--color-accent); }
@media (max-width: 360px) {
  .topbar { gap: 6px; padding-inline: 12px; }
  .topbar__name { font-size: 0.95rem; }
}
````

Replace the whole file `features/signin/signin.js`:

````js
// Sign-in screen (#/signin), v1's login card. Google is the only method (spec §2).
import { html, raw } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { signInWithGoogle } from '../../lib/auth.js';
import { themeToggleHtml, wireThemeToggles } from '../../lib/theme.js';

const IGNORED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

// Google "G" mark (trusted constant markup).
const GOOGLE_G = raw(`<svg class="signin__g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.5z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>`);

export function init(container) {
  container.innerHTML = html`
    <section class="signin">
      <div class="signin__top">${themeToggleHtml()}</div>
      <div class="card signin__card">
        <img class="signin__logo" src="/assets/logo-512.png" alt="Paddle District logo" width="132" height="132">
        <h1 class="signin__title">Paddle District</h1>
        <p class="signin__tagline">Pickleball Community · Version 2</p>
        <p class="signin__pitch">Run open play, queue from your phone, and see when you're up.</p>
        <button type="button" class="btn signin__google" id="google">${GOOGLE_G}<span>Continue with Google</span></button>
      </div>
      <p class="signin__note">Signing in with Google verifies your player account.</p>
    </section>`;
  wireThemeToggles(container);

  const btn = container.querySelector('#google');
  const label = btn.querySelector('span');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    label.textContent = 'Opening Google…';
    try {
      await signInWithGoogle(); // lib/app.js moves on once the auth state changes
    } catch (err) {
      if (!IGNORED.has(err?.code)) showToast(`Sign-in failed: ${err?.message ?? err}`, 'error');
      btn.disabled = false;
      label.textContent = 'Continue with Google';
    }
  });
}
````

Replace the whole file `features/signin/signin.css`:

````css
.signin {
  min-height: 100vh;
  max-width: 420px; margin: 0 auto;
  padding: var(--space-3) var(--space-3) var(--space-5);
  display: flex; flex-direction: column; justify-content: center; gap: var(--space-3);
}
.signin__top { display: flex; justify-content: flex-end; }
.signin__card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-2); padding: var(--space-5) var(--space-4); }
.signin__logo { width: 132px; height: 132px; object-fit: contain; border-radius: 20px; background: #fff; padding: 4px; }
.signin__title { font-size: 1.6rem; font-weight: 900; margin-top: var(--space-2); }
.signin__tagline { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-muted); }
.signin__pitch { color: var(--color-muted); margin: var(--space-2) 0 var(--space-3); line-height: 1.6; }
.signin__google { width: 100%; min-height: 52px; background: #fff; color: #1C1F14; border-color: var(--color-border); font-size: 1rem; }
.signin__google:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); }
.signin__g { width: 20px; height: 20px; flex: none; }
.signin__note { text-align: center; color: var(--color-muted); font-size: 0.85rem; }
````

- [ ] **Step 2: Home, setup, my profile, public profile, shared field helpers**

Replace the whole file `features/home/home.js`:

````js
// Home (#/home). Placeholder until Plan 3 brings My Sessions here.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';

export function init(container) {
  const { profile } = getSession();
  container.innerHTML = html`
    <section class="page home">
      <div class="home__hello">
        <p class="eyebrow">Welcome back</p>
        <h1 class="page__title">Hi, ${profile.displayName} 👋</h1>
      </div>
      <div class="card home__soon">
        <span class="home__soon-icon" aria-hidden="true">🏓</span>
        <h2 class="card__title">Open play sessions are coming next</h2>
        <p class="page__sub">Soon you'll check in by QR, queue for courts from your phone, and see when you're up — right here.</p>
      </div>
      <a class="btn btn--primary btn--block" href="#/me">Show my player card</a>
    </section>`;
}
````

Replace the whole file `features/home/home.css`:

````css
.home__hello { display: flex; flex-direction: column; gap: 2px; }
.home__soon { display: flex; flex-direction: column; gap: var(--space-2); border-left: 5px solid var(--color-highlight); }
.home__soon-icon { font-size: 1.6rem; }
````

Replace the whole file `features/shared/rating-field.js`:

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
      <span class="field__hint" data-level-hint aria-live="polite">${level ? level.hint : ''}</span>
      <span class="field__error" data-error="selfRating" aria-live="polite"></span>
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

// Moves keyboard/screen-reader focus to the first invalid field (on submit).
export function focusFirstError(form) {
  form.querySelector('[aria-invalid="true"]')?.focus();
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

Replace the whole file `features/setup/setup.js`:

````js
// First-time profile setup (#/setup): name, unique @handle, self-rating.
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { getSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { suggestHandle } from '../../lib/handle.js';
import { NAME_MAX, DEFAULT_SELF_RATING, cleanName, validateProfileInput } from '../../lib/profile-input.js';
import { createProfile, isHandleTaken } from '../../lib/profiles.js';
import { ratingFieldHtml, wireRatingField, showErrors, focusFirstError } from '../shared/rating-field.js';

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
          <span class="field__error" data-error="displayName" aria-live="polite"></span>
        </label>
        <label class="field">
          <span class="field__label">Handle</span>
          <span class="input-prefix"><span>@</span><input class="input" name="handle" value="${suggestHandle(name)}" maxlength="20" autocapitalize="off" autocomplete="off" spellcheck="false"></span>
          <span class="field__hint" data-handle-status aria-live="polite">Players can search for you by this.</span>
          <span class="field__error" data-error="handle" aria-live="polite"></span>
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
    status.textContent = ''; // never leave an answer for an older value on screen
    checkId++;
    clearTimeout(timer);
    timer = setTimeout(checkHandle, CHECK_DELAY_MS);
  });
  checkHandle();

  const slowTimers = new Set();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const { ok, value, errors } = validateProfileInput(data);
    showErrors(form, errors);
    if (!ok) { focusFirstError(form); return; }
    submit.disabled = true;
    submit.textContent = 'Creating…';
    const slowTimer = setTimeout(() => { status.textContent = 'Waiting for a connection…'; }, 5000);
    slowTimers.add(slowTimer);
    try {
      await createProfile(user.uid, { ...value, photoURL });
      clearTimeout(slowTimer);
      showToast(`Welcome, ${value.displayName}!`, 'success'); // lib/app.js routes on from here
    } catch (err) {
      clearTimeout(slowTimer);
      if (err.message === 'handle-taken') showErrors(form, { handle: `@${value.handle} was just taken — try another.` });
      else showToast(`Could not create your profile: ${err.message}`, 'error');
      submit.disabled = false;
      submit.textContent = 'Create profile';
    }
  });

  container.addEventListener('view:teardown', () => { clearTimeout(timer); slowTimers.forEach(clearTimeout); }, { once: true });
}
````

Replace the whole file `features/setup/setup.css`:

````css
.setup__form { display: flex; flex-direction: column; gap: var(--space-3); }
.setup__photo { display: flex; justify-content: center; }
.setup__form .btn--primary { align-self: stretch; min-height: 52px; }
````

Replace the whole file `features/me/me.js`:

````js
// My profile (#/me): player card with QR, edit name/level, sign out.
import { html, raw } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { getSession, onSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { levelFor, NAME_MAX, validateProfileInput } from '../../lib/profile-input.js';
import { updateProfile } from '../../lib/profiles.js';
import { signOut } from '../../lib/auth.js';
import { ratingFieldHtml, wireRatingField, showErrors, focusFirstError } from '../shared/rating-field.js';

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
      <span class="pill pill--gold">${p.selfRating.toFixed(1)} · ${levelFor(p.selfRating)?.label ?? ''}</span>
    </div>`;
}

// Load the QR generator lazily so a failed import can't blank the whole screen.
async function fillQr(box, handle, isAlive) {
  try {
    const { qrSvg } = await import('../../lib/qr.js');
    if (isAlive()) box.innerHTML = html`${raw(qrSvg(profileUrl(handle)))}`;
  } catch {
    if (isAlive()) box.textContent = 'QR code unavailable — check your connection.';
  }
}

export function init(container) {
  const p = getSession().profile;
  container.innerHTML = html`
    <section class="page me">
      <div class="card me__card">
        <div class="me__head" data-card>${cardHtml(p)}</div>
        <div class="me__qr" data-qr></div>
        <p class="me__qr-note">Show this to an organizer — they scan it with their phone camera to add you.</p>
      </div>
      <form class="card me__form" novalidate>
        <h2 class="me__form-title">Edit profile</h2>
        <label class="field">
          <span class="field__label">Name</span>
          <input class="input" name="displayName" value="${p.displayName}" maxlength="${NAME_MAX}" autocomplete="name">
          <span class="field__error" data-error="displayName" aria-live="polite"></span>
        </label>
        ${ratingFieldHtml(p.selfRating)}
        <button class="btn btn--primary" type="submit">Save</button>
      </form>
      <button type="button" class="btn btn--ghost me__signout" id="signout">Sign out</button>
    </section>`;

  let alive = true;
  fillQr(container.querySelector('[data-qr]'), p.handle, () => alive);

  const form = container.querySelector('form');
  wireRatingField(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const { ok, value, errors } = validateProfileInput(data);
    showErrors(form, errors);
    if (!ok) { focusFirstError(form); return; }
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
  container.addEventListener('view:teardown', () => { alive = false; off(); }, { once: true });
}
````

Replace the whole file `features/me/me.css`:

````css
.me__card { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); text-align: center; }
.me__head { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.me__who { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }
.me__name { font-size: 1.4rem; font-weight: 800; }
.me__handle { color: var(--color-muted); font-weight: 600; }
.me__qr { width: min(240px, 70vw); background: var(--color-qr-bg); padding: var(--space-2); border-radius: var(--radius); border: 1px solid var(--color-border); }
.me__qr svg { display: block; width: 100%; height: auto; }
.me__qr-note { color: var(--color-muted); font-size: 0.85rem; }
.me__form { display: flex; flex-direction: column; gap: var(--space-3); }
.me__form-title { font-size: 1.1rem; }
.me__form .btn--primary { align-self: stretch; }
.me__signout { align-self: center; }
````

Replace the whole file `features/profile/profile.js`:

````js
// Public player profile (#/u/{handle}) — where a player-card QR lands.
import { html } from '../../lib/html.js';
import { getSession } from '../../lib/session.js';
import { avatarHtml } from '../../lib/avatar.js';
import { normalizeHandle, isValidHandle } from '../../lib/handle.js';
import { levelFor } from '../../lib/profile-input.js';
import { findByHandle } from '../../lib/profiles.js';

export function init(container, param) {
  let raw = param ?? '';
  try { raw = decodeURIComponent(raw); } catch { /* malformed escape → treated as an invalid handle below */ }
  const handle = normalizeHandle(raw);
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
        <span class="pill pill--gold">${p.selfRating.toFixed(1)} · ${levelFor(p.selfRating)?.label ?? ''}</span>
        ${mine ? html`<a class="btn btn--secondary profile__edit" href="#/me">Edit my profile</a>` : ''}
      </div>`);
  }).catch((err) => show(html`
    <h1 class="page__title">Couldn't load this player</h1>
    <p class="page__sub">${err.message}</p>`));
}
````

Replace the whole file `features/profile/profile.css`:

````css
.profile__card { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); text-align: center; }
.profile__name { font-size: 1.5rem; }
.profile__handle { color: var(--color-muted); font-weight: 600; }
.profile__edit, .profile__back { margin-top: var(--space-2); text-decoration: none; align-self: center; }
````

- [ ] **Step 3: Unit tests**

`npm test` → all pass (127).

- [ ] **Step 4: Browser checks** (controller runs these if the implementer can't): `npm run emulators` + `npm run serve`, phone size 390×844.

- **L1** Three cold loads of `#/signin` in a row all render the card (no "Couldn't start").
- **T1** With no saved theme and a light device, the page is light; toggle → dark; reload → still dark (no light flash).
- **T2** With a dark device and nothing saved, the first paint is dark.
- **V1** Sign-in matches v1's card: logo, "Paddle District", "PICKLEBALL COMMUNITY · VERSION 2", white Google button with the G mark.
- **S1** On setup, after "@x is available" shows, typing another character clears it immediately; submitting an empty name and bad handle shows inline ⚠ errors and focuses the Name field.
- **D1–D3** Home, My profile and public profile in **dark** mode: header (logo on white badge, toggle, avatar ring), gold level pill, QR on white, readable muted text.
- **N1** At 320×640: no horizontal scroll on home/me/profile and the header shows the full "Paddle District".
- **A1** No button or link tap target under 44 px; console clean.

- [ ] **Step 5: Commit**

```bash
git add features/
git commit -m "feat(ui): v1-style header, sign-in card, restyled screens, focus first error"
```

### Task 4: Docs

**Files:** Modify `docs/INDEX.md`, `AGENTS.md`

- [ ] **Step 1:** `docs/INDEX.md` — in **Architecture & core knowledge** add:
  `| Brand & theme | v1 look: tokens (light + dark) in styles/tokens.css; lib/theme-choice.js (pure) + lib/theme.js; inline pre-paint script in index.html; assets/ (logo-512, favicon). | spec §7 |`
  and in **Plans** add:
  `| 2026-10-03 | [Step 1 — Rebrand](superpowers/plans/2026-10-03-rebrand-v1-look.md) | v1 branding + UI-friendly rules on existing screens. |`
- [ ] **Step 2:** `AGENTS.md` — in the `lib/` pure list add `theme-choice`; in the browser/services list add `theme`; under Architecture's tree add the line `assets/            # logo-512.png, favicon.png (from v1)`.
- [ ] **Step 3:** `npm test` → pass. Commit:

```bash
git add docs/INDEX.md AGENTS.md
git commit -m "docs: index the rebrand (theme modules, assets)"
```

### Task 5: Redeploy (⚠ controller only, on the user's explicit go-ahead)

After the user checks localhost: `npm run test:rules` (green, rules unchanged), `npx --prefix rules-tests firebase deploy --only hosting --project paddle-district-v2`, then diff every served file against local (incl. `assets/*`), confirm private paths 404 and `cache-control: no-cache`.

