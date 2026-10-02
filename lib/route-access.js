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
  if (status === 'ready') {
    return AUTH_ROUTES.has(name) ? { redirect: 'home', resume: true } : { show: name };
  }
  return { wait: true }; // unknown status: render nothing rather than fail open
}
