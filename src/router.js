import * as page0 from './pages/home/home.js';
import * as page1 from './pages/login/login.js';
import * as page2 from './pages/register/register.js';
import * as page3 from './pages/listings/listings.js';
import * as page4 from './pages/listing-details/listing-details.js';
import * as page5 from './pages/add-listing/add-listing.js';
import * as page6 from './pages/edit-listing/edit-listing.js';
import * as page7 from './pages/my-listings/my-listings.js';
import * as page8 from './pages/favorites/favorites.js';
import * as page9 from './pages/admin/admin.js';
import * as page10 from './pages/not-found/not-found.js';
import * as dashboard from './pages/dashboard/dashboard.js';
import { safeReturnUrl } from './utils/auth-validation.js';
import { showError } from './services/toast-service.js';

// Static /listings/add must precede the parameterized detail route.
const routes = [
  [/^\/$/, page0], [/^\/login$/, page1], [/^\/register$/, page2],
  [/^\/listings$/, page3], [/^\/listings\/add$/, page5],
  [/^\/listings\/([^/]+)\/edit$/, page6], [/^\/listings\/([^/]+)$/, page4],
  [/^\/my-listings$/, page7], [/^\/favorites$/, page8], [/^\/admin$/, page9],
  [/^\/dashboard$/, dashboard],
];

export function createRouter(container, onNavigate, { auth }) {
  let cleanup;
  let accessKey;
  let currentIndex = Number.isInteger(history.state?.minimarketIndex) ? history.state.minimarketIndex : 0;
  let currentUrl = location.href;
  let restoringPop = false;
  history.replaceState({ ...history.state, minimarketIndex: currentIndex }, '', location.href);
  const canLeave = () => !cleanup?.canLeave || cleanup.canLeave();
  function navigate(to, { replace = false } = {}) {
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return false;
    if (url.href === location.href) return true;
    if (!canLeave()) return false;
    if (!replace) currentIndex += 1;
    history[replace ? 'replaceState' : 'pushState']({ ...history.state, minimarketIndex: currentIndex }, '', url.pathname + url.search + url.hash);
    currentUrl = location.href;
    render();
    return true;
  }
  function render() {
    cleanup?.();
    cleanup = undefined;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const state = auth.getState();
    const accountPage = ['/login', '/register'].includes(path);
    const protectedPage = ['/dashboard', '/my-listings', '/favorites', '/listings/add', '/admin'].includes(path) || /^\/listings\/[^/]+\/edit$/.test(path);
    if (!state.ready && (accountPage || protectedPage)) {
      container.innerHTML = '<div class="home-feedback" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Restoring your session…</div>';
      document.title = 'Loading | MiniMarket';
      onNavigate(path, state);
      return;
    }
    if (protectedPage && !state.user) {
      const returnTo = path + location.search + location.hash;
      navigate(`/login?${new URLSearchParams({ returnTo })}`, { replace: true });
      return;
    }
    if (path === '/admin' && state.profile?.role !== 'admin') {
      showError('You do not have permission to open the Admin Dashboard.');
      navigate('/my-listings', { replace: true });
      return;
    }
    if (accountPage && state.user) {
      navigate(safeReturnUrl(new URLSearchParams(location.search).get('returnTo')), { replace: true });
      return;
    }
    const match = routes.find(([pattern]) => pattern.test(path));
    const page = match?.[1] ?? page10;
    const captures = match?.[0].exec(path);
    cleanup = page.mount(container, { navigate, auth, params: { id: captures?.[1] } });
    document.title = page.title + ' | MiniMarket';
    onNavigate(path, state);
    const hashTarget = document.getElementById(window.location.hash.slice(1));
    const focusTarget = hashTarget || container.querySelector('h1') || container;
    focusTarget.focus({ preventScroll: true });
    if (hashTarget) hashTarget.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  function handlePopState(event) {
    if (restoringPop) { restoringPop = false; return; }
    const targetIndex = Number.isInteger(event.state?.minimarketIndex) ? event.state.minimarketIndex : currentIndex;
    const previous = new URL(currentUrl);
    // Native fragment history should not unmount or discard the current form.
    if (location.pathname === previous.pathname && location.search === previous.search) {
      currentIndex = targetIndex; currentUrl = location.href; return;
    }
    if (!canLeave()) {
      if (targetIndex !== currentIndex) {
        restoringPop = true;
        history.go(currentIndex - targetIndex);
      } else history.replaceState({ ...history.state, minimarketIndex: currentIndex }, '', currentUrl);
      return;
    }
    currentIndex = targetIndex; currentUrl = location.href;
    render();
  }

  function handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.relList.contains('external')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return;
    // Let native fragment links (including the skip link) keep normal behavior.
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    event.preventDefault();
    navigate(url);
  }

  document.addEventListener('click', handleClick);
  window.addEventListener('popstate', handlePopState);
  const unsubscribe = auth.subscribe((state) => {
    const nextKey = `${state.ready}:${state.user?.id || ''}:${state.profile?.role || ''}:${state.error || ''}`;
    if (nextKey !== accessKey) { accessKey = nextKey; render(); }
  });
  render();
  return {
    navigate, canLeave,
    dispose() {
      cleanup?.();
      unsubscribe();
      document.removeEventListener('click', handleClick);
      window.removeEventListener('popstate', handlePopState);
    },
  };
}
