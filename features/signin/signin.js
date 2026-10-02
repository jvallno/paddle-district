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
