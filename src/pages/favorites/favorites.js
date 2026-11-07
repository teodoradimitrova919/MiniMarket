import html from './favorites.html?raw';
import './favorites.css';

export const title = 'Favorites';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
