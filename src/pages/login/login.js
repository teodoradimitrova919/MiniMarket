import html from './login.html?raw';
import './login.css';

export const title = 'Login';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
