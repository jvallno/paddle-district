// Sign-in screen (#/signin). Google sign-in is the only method (spec §2).
import { html } from '../../lib/html.js';
import { showToast } from '../../lib/toast.js';
import { signInWithGoogle } from '../../lib/auth.js';

const IGNORED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

export function init(container) {
  container.innerHTML = html`
    <section class="signin">
      <p class="signin__brand">Paddle District</p>
      <h1 class="signin__title">Open play, without the paddle pile.</h1>
      <p class="signin__sub">Check in, join the queue from your phone, and see when you're up.</p>
      <button type="button" class="btn btn--primary signin__google" id="google">Continue with Google</button>
      <p class="signin__note">Signing in with Google verifies your player account.</p>
    </section>`;

  const btn = container.querySelector('#google');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await signInWithGoogle(); // lib/app.js moves on once the auth state changes
    } catch (err) {
      if (!IGNORED.has(err?.code)) showToast(`Sign-in failed: ${err?.message ?? err}`, 'error');
      btn.disabled = false;
    }
  });
}
