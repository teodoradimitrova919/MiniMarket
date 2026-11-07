import html from './listings.html?raw';
import './listings.css';

export const title = 'Browse Listings';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
