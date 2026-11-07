import html from './edit-listing.html?raw';
import './edit-listing.css';

export const title = 'Edit Listing';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
