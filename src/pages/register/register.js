import html from './register.html?raw';
import './register.css';
import { bindAuthForm } from '../../utils/auth-form.js';

export const title = 'Register';
export function mount(container, context) {
  container.innerHTML = html;
  return bindAuthForm(container, context, { registration: true });
}
