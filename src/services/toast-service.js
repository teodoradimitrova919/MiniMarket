import Toast from 'bootstrap/js/dist/toast';
import html from '../components/toast/toast.html?raw';
import '../components/toast/toast.css';
import { FEEDBACK_EVENT, markReported, wasReported } from '../utils/operation-feedback.js';

const styles = {
  success: { title: 'Success', icon: 'check-circle', delay: 5000, fallback: 'Your action was completed.' },
  error: { title: 'Something went wrong', icon: 'exclamation-circle', delay: 7000, fallback: 'Something went wrong. Please try again.' },
  info: { title: 'Information', icon: 'info-circle', delay: 5000, fallback: 'Please review the information on this page.' },
};
const active = new Map();
const recent = new Map();
let host;
let events;

function safeMessage(message, type) {
  if (typeof message !== 'string' || !message.trim()) return styles[type].fallback;
  // Callers must supply curated UI copy, never raw Error objects or API responses.
  const sensitive = /sb_(?:secret|publishable)_|\bsbp_|\beyJ[\w-]+\.[\w-]+\.|\bBearer\s+\S+|\b(?:password|access_token|refresh_token|service_role|api[_ -]?key|token)\s*[:=]\s*\S+|\b(?:PGRST\d+|SQLSTATE|42501|23505|23503|23514|23502|AUTH_[A-Z_]+)\b/i;
  if (sensitive.test(message) || /^(?:[A-Z][A-Z0-9_]{3,}|\d{5})$/.test(message.trim())) return styles[type].fallback;
  return message.trim().replace(/\s+/g, ' ').slice(0, 300);
}

function remove(key) {
  const record = active.get(key);
  if (!record) return;
  record.element.removeEventListener('hidden.bs.toast', record.onHidden);
  record.instance.dispose();
  record.element.remove();
  active.delete(key);
  recent.set(key, Date.now() + 1000);
}

export function clearToasts() {
  for (const key of active.keys()) remove(key);
  recent.clear();
}

export function disposeToasts() {
  events?.abort();
  events = undefined;
  clearToasts();
  host?.remove();
  host = undefined;
}

export function initializeToasts() {
  if (host?.isConnected) return disposeToasts;
  const template = document.createElement('template');
  template.innerHTML = html;
  host = document.getElementById('minimarket-toasts') || template.content.firstElementChild.cloneNode(true);
  if (!host.isConnected) document.body.append(host);
  events = new AbortController();
  window.addEventListener(FEEDBACK_EVENT, (event) => {
    if (event.detail?.type === 'success') showSuccess(event.detail.message);
    else if (event.detail?.type === 'error') showError(event.detail.message);
  }, { signal: events.signal });
  function unexpected(error) {
    if (error?.code === 'VALIDATION_ERROR' || wasReported(error)) return;
    markReported(error);
    showError(styles.error.fallback);
  }
  window.addEventListener('error', (event) => { if (event.error) unexpected(event.error); }, { signal: events.signal });
  window.addEventListener('unhandledrejection', (event) => unexpected(event.reason), { signal: events.signal });
  return disposeToasts;
}

function show(type, message) {
  initializeToasts();
  const text = safeMessage(message, type);
  const key = `${type}:${text.toLowerCase()}`;
  for (const [previous, expires] of recent) if (expires <= Date.now()) recent.delete(previous);
  if (active.has(key)) return active.get(key).element;
  if (recent.has(key)) return null;
  // Keep the stack usable on small screens, without leaving Bootstrap timers alive.
  if (active.size >= 3) remove(active.keys().next().value);
  const element = host.querySelector('[data-toast-template]').content.firstElementChild.cloneNode(true);
  element.classList.add(`minimarket-toast-${type}`);
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.querySelector('[data-toast-title]').textContent = styles[type].title;
  element.querySelector('[data-toast-icon]').classList.add(`bi-${styles[type].icon}`);
  element.querySelector('[data-toast-message]').textContent = text;
  host.querySelector(`[data-toast-region="${type === 'error' ? 'assertive' : 'polite'}"]`).append(element);
  const instance = new Toast(element, { autohide: true, delay: styles[type].delay, animation: false });
  const onHidden = () => remove(key);
  active.set(key, { element, instance, onHidden });
  element.addEventListener('hidden.bs.toast', onHidden);
  instance.show();
  return element;
}

export const showError = (message) => show('error', message);
export const showSuccess = (message) => show('success', message);
export const showInfo = (message) => show('info', message);
