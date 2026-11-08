import { supabase } from './supabase-client.js';
import { validateEmail, validatePassword, validateUsername } from '../utils/auth-validation.js';
import { runQuery, serviceError } from '../utils/service-errors.js';

const messages = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email before signing in.',
  user_already_exists: 'An account already exists with this email. Try signing in.',
  weak_password: 'Choose a stronger password with at least 6 characters.',
  signup_disabled: 'Registration is currently unavailable.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  over_email_send_rate_limit: 'Please wait before trying to register again.',
  email_address_invalid: 'Enter a valid email address.',
};

async function authRequest(operation, action) {
  let response;
  try { response = await operation(); } catch {
    throw serviceError(`${action} failed. Check your connection and try again.`, 'AUTH_REQUEST_FAILED');
  }
  if (response.error) {
    throw serviceError(messages[response.error.code] || `${action} failed. Please try again.`,
      response.error.code || 'AUTH_REQUEST_FAILED', response.error);
  }
  return response.data;
}

export async function register(email, password, username) {
  const values = { email: validateEmail(email), password: validatePassword(password, { registration: true }),
    options: { data: { username: validateUsername(username) } } };
  // The existing database trigger creates the profile with role=user.
  return authRequest(() => supabase.auth.signUp(values), 'Registration');
}

export async function login(email, password) {
  const values = { email: validateEmail(email), password: validatePassword(password) };
  return authRequest(() => supabase.auth.signInWithPassword(values), 'Sign in');
}

export async function logout() {
  await authRequest(() => supabase.auth.signOut({ scope: 'local' }), 'Sign out');
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const data = await authRequest(() => supabase.auth.getUser(), 'Session verification');
  return data.user;
}

export async function getSession() {
  const data = await authRequest(() => supabase.auth.getSession(), 'Session restoration');
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

export async function getCurrentProfile(userId) {
  return runQuery(supabase.from('profiles').select('id, username, role').eq('id', userId).single(),
    'Unable to load your profile');
}
