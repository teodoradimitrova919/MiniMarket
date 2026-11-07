import html from './my-listings.html?raw';
import './my-listings.css';

export const title = 'My Listings';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
