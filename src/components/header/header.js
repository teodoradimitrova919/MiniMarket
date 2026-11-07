import html from './header.html?raw';
import './header.css';
import Collapse from 'bootstrap/js/dist/collapse';

export function mountHeader(container) {
  container.innerHTML = html;
  const menu = container.querySelector('#main-navigation');
  const collapse = new Collapse(menu, { toggle: false });
  return {
    update(path) {
      for (const link of container.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href');
        const active = href === path || (href === '/listings' && path.startsWith('/listings/'));
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      collapse.hide();
    },
    unmount() { collapse.dispose(); container.replaceChildren(); },
  };
}
