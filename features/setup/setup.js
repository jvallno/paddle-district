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
