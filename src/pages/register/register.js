import html from './register.html?raw';
import './register.css';

export const title = 'Register';

export function mount(container) {
  container.innerHTML = html;
  // Return cleanup here when this page gains listeners or subscriptions.
  return () => {};
}
