import html from './login.html?raw';
import './login.css';
import { bindAuthForm } from '../../utils/auth-form.js';

export const title = 'Login';
export function mount(container, context) {
  container.innerHTML = html;
  return bindAuthForm(container, context);
}
