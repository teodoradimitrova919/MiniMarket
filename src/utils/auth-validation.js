import { serviceError } from './service-errors.js';

export function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw serviceError('Enter a valid email address.', 'VALIDATION_ERROR');
  return email;
}

export function validatePassword(value, { registration = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw serviceError('Enter your password.', 'VALIDATION_ERROR');
  if (registration && value.length < 6) throw serviceError('Use a password with at least 6 characters.', 'VALIDATION_ERROR');
  return value;
}

export function validateUsername(value) {
  if (typeof value !== 'string' || !value.trim()) throw serviceError('Enter a username.', 'VALIDATION_ERROR');
  return value.trim();
}

export function safeReturnUrl(value, fallback = '/dashboard') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (url.origin !== window.location.origin || ['/login', '/register'].includes(path)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
