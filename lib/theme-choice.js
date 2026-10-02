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
