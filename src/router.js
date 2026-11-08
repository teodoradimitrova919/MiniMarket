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

// Static /listings/add must precede the parameterized detail route.
const routes = [
  [/^\/$/, page0], [/^\/login$/, page1], [/^\/register$/, page2],
  [/^\/listings$/, page3], [/^\/listings\/add$/, page5],
  [/^\/listings\/([^/]+)\/edit$/, page6], [/^\/listings\/([^/]+)$/, page4],
  [/^\/my-listings$/, page7], [/^\/favorites$/, page8], [/^\/admin$/, page9],
];

export function createRouter(container, onNavigate) {
  let cleanup;
  function navigate(to) {
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.href !== location.href) history.pushState(null, '', url.pathname + url.search + url.hash);
    render();
  }
  function render() {
    cleanup?.();
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const match = routes.find(([pattern]) => pattern.test(path));
    const page = match?.[1] ?? page10;
    cleanup = page.mount(container, { navigate });
    document.title = page.title + ' | MiniMarket';
    onNavigate(path);
    const hashTarget = document.getElementById(window.location.hash.slice(1));
    const focusTarget = hashTarget || container.querySelector('h1') || container;
    focusTarget.focus({ preventScroll: true });
    if (hashTarget) hashTarget.scrollIntoView();
    else window.scrollTo(0, 0);
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
  window.addEventListener('popstate', render);
  render();
  return () => {
    cleanup?.();
    document.removeEventListener('click', handleClick);
    window.removeEventListener('popstate', render);
  };
}
