import html from './listing-details.html?raw';
import './listing-details.css';

export const title = 'Listing Details';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
