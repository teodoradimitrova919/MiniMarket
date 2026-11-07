import html from './home.html?raw';
import './home.css';

export const title = 'Home';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
