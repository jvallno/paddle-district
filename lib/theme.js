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
