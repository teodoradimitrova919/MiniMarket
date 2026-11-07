import html from './footer.html?raw';
import './footer.css';

export function mountFooter(container) {
  container.innerHTML = html;
  container.querySelector('[data-year]').textContent = new Date().getFullYear();
  return () => container.replaceChildren();
}
