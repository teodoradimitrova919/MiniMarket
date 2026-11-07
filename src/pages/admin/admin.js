import html from './admin.html?raw';
import './admin.css';

export const title = 'Admin Dashboard';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
