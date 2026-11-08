import { validateEmail, validatePassword, validateUsername, safeReturnUrl } from './auth-validation.js';
import { serviceError } from './service-errors.js';

export function bindAuthForm(container, { navigate, auth }, { registration = false } = {}) {
  const form = container.querySelector('form');
  const button = form.querySelector('button[type="submit"]');
  const message = container.querySelector('[data-auth-message]');
  const controller = new AbortController();
  const originalLabel = button.textContent;
  let active = true;
  let pending = false;
  function showMessage(text, success = false) {
    message.textContent = text;
    message.className = `alert ${success ? 'alert-success' : 'alert-danger'}`;
    message.setAttribute('role', success ? 'status' : 'alert');
    message.hidden = false;
    message.focus();
  }
  const returnTo = safeReturnUrl(new URLSearchParams(location.search).get('returnTo'));
  const switchLink = container.querySelector('[data-auth-switch]');
  if (new URLSearchParams(location.search).has('returnTo')) {
    switchLink.href += `?${new URLSearchParams({ returnTo })}`;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    message.hidden = true;
    try {
      const data = new FormData(form);
      const email = validateEmail(data.get('email'));
      const password = validatePassword(data.get('password'), { registration });
      const username = registration ? validateUsername(data.get('username')) : null;
      if (registration && password !== data.get('confirmPassword')) throw serviceError('Passwords do not match.', 'VALIDATION_ERROR');
      pending = true;
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      button.textContent = registration ? 'Creating account…' : 'Signing in…';
      const service = await import('../services/auth-service.js');
      if (!active) return;
      const result = registration ? await service.register(email, password, username) : await service.login(email, password);
      if (!active) return;
      form.reset();
      if (!result.session) {
        if (!registration) throw serviceError('Sign in did not establish a session. Please try again.', 'AUTH_REQUEST_FAILED');
        showMessage('Your registration request was received. Check your email to confirm your account before signing in.', true);
      } else {
        await auth.refresh();
        if (active) navigate(returnTo, { replace: true });
      }
    } catch (error) {
      if (active) showMessage(error.message || 'Something went wrong. Please try again.');
    } finally {
      pending = false;
      if (active) { button.disabled = false; button.textContent = originalLabel; form.setAttribute('aria-busy', 'false'); }
    }
  }, { signal: controller.signal });
  return () => { active = false; controller.abort(); form.reset(); };
}
