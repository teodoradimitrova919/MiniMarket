import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readConfig } from './seed.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base = process.env.AUTH_TEST_URL || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let newUserId;
let adminClient;
const go = async (path) => { await page.goto(base + path); };
const waitPath = (path) => page.waitForURL((url) => url.pathname === path);
const login = async (email, password) => {
  await page.locator('form').getByLabel('Email', { exact: true }).fill(email);
  await page.locator('form').getByLabel('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Login', exact: true }).click();
};
const logout = async () => { await page.locator('[data-logout]').click(); await waitPath('/'); await page.locator('[data-guest-only]:not([hidden])').waitFor(); };

try {
  await go('/');
  await page.locator('[data-guest-only]:not([hidden])').waitFor();
  assert.equal(await page.locator('header a[href="/my-listings"]').isVisible(), false);
  for (const path of ['/dashboard', '/my-listings', '/favorites', '/listings/add', '/listings/example/edit', '/admin']) {
    await go(path); await waitPath('/login');
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), path);
    await page.locator('form').waitFor();
  }
  await go('/login');
  await page.locator('form').getByRole('button').click();
  await page.getByRole('alert').filter({ hasText: 'valid email' }).waitFor();
  await login('test@test.com', 'intentionally-wrong-password');
  await page.getByRole('alert').filter({ hasText: 'Email or password is incorrect' }).waitFor();
  await go('/listings/add'); await waitPath('/login');
  await login('test@test.com', 'pass123'); await waitPath('/listings/add');
  assert.equal(await page.locator('h1').textContent(), 'Add Listing');
  assert.equal(await page.locator('[data-logout]').isVisible(), true);
  assert.equal(await page.locator('header a[href="/login"]').isVisible(), false);
  assert.equal(await page.locator('header a[href="/admin"]').isVisible(), false);
  await page.reload(); await page.locator('h1').filter({ hasText: 'Add Listing' }).waitFor();
  await go('/admin'); await waitPath('/my-listings');
  await go('/login'); await waitPath('/dashboard');
  await go('/register'); await waitPath('/dashboard');
  await page.locator('header a.nav-link[href="/"]').click(); await waitPath('/');
  await page.locator('header a[href="/favorites"]').click(); await waitPath('/favorites');
  await page.goBack(); await waitPath('/');
  await page.goForward(); await waitPath('/favorites');
  // Sign-out in another tab must clear the current user's protected view.
  const secondTab = await page.context().newPage();
  await secondTab.goto(base);
  await secondTab.locator('[data-logout]:not([hidden])').waitFor();
  await secondTab.locator('[data-logout]').click();
  await waitPath('/login');
  await secondTab.close();
  await login('test@test.com', 'pass123'); await waitPath('/favorites');
  // An expired refresh token is a controlled response, not a demo-user change.
  await page.route('**/auth/v1/token*', (route) => {
    if (new URL(route.request().url()).searchParams.get('grant_type') === 'refresh_token') {
      return route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', message: 'Refresh token not found' } });
    }
    return route.continue();
  });
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.endsWith('-auth-token'));
    const stored = JSON.parse(localStorage.getItem(key));
    stored.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload(); await waitPath('/login');
  assert.equal(await page.locator('header a[href="/my-listings"]').isVisible(), false);
  await page.unroute('**/auth/v1/token*');
  await login('test@test.com', 'pass123'); await waitPath('/favorites');
  await logout();
  await go('/login?returnTo=https%3A%2F%2Fevil.example');
  await login('test@test.com', 'pass123'); await waitPath('/dashboard');
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  await logout();
  await go('/login'); await login('admin@admin.com', 'pass123'); await waitPath('/dashboard');
  await page.locator('header a[href="/admin"]').waitFor();
  await page.locator('header a[href="/admin"]').click(); await waitPath('/admin');
  assert.equal(await page.locator('h1').textContent(), 'Admin Dashboard');
  await page.reload(); await page.locator('h1').filter({ hasText: 'Admin Dashboard' }).waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.locator('#main-navigation.show').waitFor();
  assert.equal(await page.locator('header a[href="/admin"]').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await logout();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await go('/register');
  await page.locator('form').getByLabel('Email', { exact: true }).fill('invalid');
  await page.locator('form').getByRole('button').click();
  await page.getByRole('alert').filter({ hasText: 'valid email' }).waitFor();
  await page.locator('form').getByLabel('Email', { exact: true }).fill('validation@example.com');
  await page.locator('form').getByLabel('Username', { exact: true }).fill('Auth check');
  await page.locator('form').getByLabel('Password', { exact: true }).fill('short');
  await page.locator('form').getByRole('button').click();
  await page.getByRole('alert').filter({ hasText: 'at least 6' }).waitFor();
  await page.locator('form').getByLabel('Password', { exact: true }).fill('test-password-123');
  await page.locator('form').getByLabel('Confirm password', { exact: true }).fill('different');
  await page.locator('form').getByRole('button').click();
  await page.getByRole('alert').filter({ hasText: 'Passwords do not match' }).waitFor();
  await mkdir('node_modules/.auth-verification', { recursive: true });
  await page.screenshot({ path: 'node_modules/.auth-verification/register-desktop.png', fullPage: true });
  for (const path of ['/register', '/login']) {
    await go(path); await page.locator('form').waitFor();
    for (const width of [375, 320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: 'node_modules/.auth-verification/login-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const publicEnv = parseEnv(await readFile('.env.local', 'utf8'));
  const settingsResponse = await fetch(publicEnv.VITE_SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY } });
  const settings = await settingsResponse.json();
  if (settings.mailer_autoconfirm === true) {
    const { url, key } = readConfig(parseEnv(await readFile('.env.seed.local', 'utf8')));
    adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await go('/register');
    const email = `minimarket-auth-${randomUUID()}@test.com`;
    await page.locator('form').getByLabel('Email', { exact: true }).fill(email);
    await page.locator('form').getByLabel('Username', { exact: true }).fill('Auth verification');
    await page.locator('form').getByLabel('Password', { exact: true }).fill('verification-pass-123');
    await page.locator('form').getByLabel('Confirm password', { exact: true }).fill('verification-pass-123');
    // Capture only the new user ID for cleanup, never tokens or credentials.
    const captureSignup = async (response) => {
      if (response.url().includes('/auth/v1/signup') && response.ok()) {
        const body = await response.json();
        if (!newUserId) newUserId = body.user?.id || body.id;
      }
    };
    page.on('response', captureSignup);
    await page.locator('form').getByRole('button').click(); await waitPath('/dashboard');
    const profile = await page.evaluate(async () => {
      const service = await import('/src/services/auth-service.js');
      const user = await service.getCurrentUser();
      return service.getCurrentProfile(user.id);
    });
    newUserId = profile.id;
    page.off('response', captureSignup);
    assert.equal(profile.role, 'user'); assert.equal(profile.username, 'Auth verification');
    await logout();
    console.log('PASS: live registration and trigger-created user profile.');
  } else console.log('NOT RUN: live registration; Confirm email remains enabled. No registration email was sent by this test.');

  // Exercise confirmation-without-session and duplicate-submit handling without emails.
  await page.route('**/auth/v1/signup*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: { id: randomUUID(), email: 'mock@example.com', identities: [], aud: 'authenticated' } });
  });
  await go('/register');
  await page.locator('form').getByLabel('Email', { exact: true }).fill('mock@example.com');
  await page.locator('form').getByLabel('Username', { exact: true }).fill('Mock user');
  await page.locator('form').getByLabel('Password', { exact: true }).fill('mock-password-123');
  await page.locator('form').getByLabel('Confirm password', { exact: true }).fill('mock-password-123');
  let submissions = 0;
  page.on('request', (request) => { if (request.url().includes('/auth/v1/signup')) submissions += 1; });
  await page.locator('form').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.locator('form[aria-busy="true"]').waitFor();
  assert.equal(await page.locator('form button').isDisabled(), true);
  await page.getByRole('status').filter({ hasText: 'Check your email' }).waitFor();
  assert.equal(submissions, 1);
  assert.equal(new URL(page.url()).pathname, '/register');
  assert.deepEqual(errors, []);
  console.log('PASS: login, invalid credentials, logout, persisted sessions, visitor/user/admin navigation and guards, safe return URLs, history, responsive forms, and mocked confirmation/duplicate-submit flow.');
} finally {
  await browser.close();
  if (newUserId && adminClient) {
    const { data, error: lookupError } = await adminClient.auth.admin.getUserById(newUserId);
    if (lookupError || !/^minimarket-auth-[a-f0-9-]+@test.com$/.test(data.user.email || '') || data.user.user_metadata?.username !== 'Auth verification') {
      throw new Error('Cleanup refused: account does not match this verification fixture.');
    }
    const { error } = await adminClient.auth.admin.deleteUser(newUserId);
    if (error) throw new Error('Temporary verification account cleanup failed.');
    console.log('PASS: temporary registration account removed; demo users unchanged.');
  }
}
