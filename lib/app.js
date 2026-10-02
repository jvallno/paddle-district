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
