import html from './not-found.html?raw';
import './not-found.css';

export const title = 'Page Not Found';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
