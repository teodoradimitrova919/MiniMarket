import html from './add-listing.html?raw';
import './add-listing.css';

export const title = 'Add Listing';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
