import html from './header.html?raw';
import './header.css';
import Collapse from 'bootstrap/js/dist/collapse';

export function mountHeader(container, { onLogout }) {
  container.innerHTML = html;
  const menu = container.querySelector('#main-navigation');
  const collapse = new Collapse(menu, { toggle: false });
  const events = new AbortController();
  const button = container.querySelector('[data-logout]');
  const errorMessage = container.querySelector('[data-header-error]');
  let active = true;
  let pending = false;
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    errorMessage.hidden = true;
    try { await onLogout(); } catch (error) {
      if (active) { errorMessage.textContent = error.message; errorMessage.hidden = false; }
    } finally {
      pending = false;
      if (active) button.disabled = false;
    }
  }, { signal: events.signal });
  return {
    update(path, state) {
      container.querySelectorAll('[data-auth-only]').forEach((element) => { element.hidden = !state.ready || !state.user; });
      container.querySelectorAll('[data-guest-only]').forEach((element) => { element.hidden = !state.ready || Boolean(state.user); });
      container.querySelectorAll('[data-admin-only]').forEach((element) => { element.hidden = !state.ready || state.profile?.role !== 'admin'; });
      errorMessage.textContent = state.error || '';
      errorMessage.hidden = !state.error;
      for (const link of container.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href');
        const active = href === path || (href === '/listings' && path.startsWith('/listings/') && path !== '/listings/add') || (href === '/admin' && path.startsWith('/admin/'));
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      collapse.hide();
    },
    unmount() { active = false; events.abort(); collapse.dispose(); container.replaceChildren(); },
  };
}
