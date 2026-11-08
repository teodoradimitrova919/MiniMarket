import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readConfig } from './seed.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const base = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5180';
const errors = [];
const statsRequests = [];
let temporaryUserId;
let admin;
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  const url = new URL(request.url());
  if (!/\/rest\/v1\/(listings|favorites)$/.test(url.pathname)) return;
  if (request.method() === 'HEAD' || url.searchParams.get('select')?.replace(/\s/g, '') === 'id,category_id') {
    statsRequests.push({ method: request.method(), url, prefer: request.headers().prefer });
  }
});
const ready = () => page.locator('[data-dashboard-content]:not([hidden])').waitFor();
const values = async () => Promise.all(['listings', 'favorites', 'categories'].map(async (key) => Number((await page.locator(`[data-stat-${key}]`).textContent()).replace(/\D/g, ''))));
const login = async (email, password = 'pass123') => {
  await page.locator('form').waitFor();
  await page.locator('form').getByLabel('Email', { exact: true }).fill(email);
  await page.locator('form').getByLabel('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button').click();
};
const logout = async () => {
  await page.locator('[data-logout]').click();
  await page.waitForURL((url) => url.pathname === '/');
  await page.locator('[data-guest-only]:not([hidden])').waitFor();
};
try {
  await page.goto(base + '/dashboard');
  await page.waitForURL((url) => url.pathname === '/login');
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/dashboard');
  assert.equal(await page.locator('header a[href="/dashboard"]').isVisible(), false);
  const ids = new Set();
  for (const [email, name, expected] of [
    ['test@test.com', 'Alex', [8, 4, 6]],
    ['admin@admin.com', 'Sofia', [4, 3, 4]],
    ['gogo@test.com', 'Gogo', [6, 5, 6]],
  ]) {
    const start = statsRequests.length;
    await login(email); await page.waitForURL((url) => url.pathname === '/dashboard'); await ready();
    assert.deepEqual(await values(), expected);
    assert.match(await page.locator('[data-dashboard-greeting]').textContent(), new RegExp(name));
    assert.equal(await page.locator('header a[href="/dashboard"]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.minimarket-toast-success').count(), 0);
    const requests = statsRequests.slice(start);
    const filters = requests.map(({ url }) => url.searchParams.get(url.pathname.endsWith('favorites') ? 'user_id' : 'owner_id'));
    assert.ok(filters.length >= 3 && filters.every((filter) => filter && filter === filters[0]), 'Every query scopes to one verified user');
    ids.add(filters[0]);
    assert.ok(requests.filter(({ method }) => method === 'HEAD').every(({ prefer }) => prefer.includes('count=exact')));
    const beforeReload = statsRequests.length;
    await page.reload(); await ready();
    assert.ok(statsRequests.length > beforeReload, 'Refresh fetches fresh statistics');
    assert.deepEqual(await values(), expected);
    await logout();
    await page.goto(base + '/login');
  }
  assert.equal(ids.size, 3, 'Different accounts use different owner filters');

  const { url, key } = readConfig(parseEnv(await readFile('.env.seed.local', 'utf8')));
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `minimarket-dashboard-${randomUUID()}@test.com`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { username: 'Dashboard verification' }, app_metadata: { minimarket_dashboard_test: true } });
  if (created.error) throw new Error('Unable to create temporary zero-data verification account.');
  temporaryUserId = created.data.user.id;
  await login(email, password); await page.waitForURL((url) => url.pathname === '/dashboard'); await ready();
  assert.deepEqual(await values(), [0, 0, 0]);
  assert.equal(await page.locator('[data-dashboard-empty]').isVisible(), true);
  await logout();

  await page.goto(base + '/listings/add'); await page.waitForURL((url) => url.pathname === '/login');
  await login('gogo@test.com'); await page.waitForURL((url) => url.pathname === '/listings/add');
  assert.equal(await page.locator('h1').textContent(), 'Add Listing', 'Safe protected return URL takes priority');
  await page.locator('header a[href="/dashboard"]').click(); await ready();
  for (const [path, heading] of [['/my-listings', 'My Listings'], ['/listings/add', 'Add Listing'], ['/favorites', 'Favorites'], ['/listings', 'Browse Listings']]) {
    await page.locator(`.dashboard-action[href="${path}"]`).click();
    assert.equal(await page.locator('h1').textContent(), heading);
    await page.goBack(); await ready();
    await page.goForward(); assert.equal(new URL(page.url()).pathname, path);
    await page.goBack(); await ready();
  }
  await mkdir('node_modules/.dashboard-verification', { recursive: true });
  await page.screenshot({ path: 'node_modules/.dashboard-verification/desktop.png', fullPage: true });
  for (const width of [1200, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width === 375) await page.screenshot({ path: 'node_modules/.dashboard-verification/mobile.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });

  let mode = 'loading';
  let release;
  let gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!/\/rest\/v1\/(listings|favorites)$/.test(url.pathname)) return route.continue();
    if (request.method() !== 'HEAD' && url.searchParams.get('select')?.replace(/\s/g, '') !== 'id,category_id') return route.continue();
    if (mode === 'loading' || mode === 'late') await gate;
    if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Controlled failure' } });
    if (request.method() === 'HEAD') return route.fulfill({ headers: {
      'content-range': `*/${url.pathname.endsWith('favorites') ? 7 : 9}`,
      'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range',
    }, body: '' });
    return route.fulfill({ json: Array.from({ length: 9 }, (_, index) => ({ id: `mock-${index}`, category_id: index ? 'one' : 'two' })) });
  });
  await page.reload();
  await page.locator('[data-dashboard-status][aria-busy="true"]').waitFor();
  assert.equal(await page.locator('[data-dashboard-content]').isVisible(), false);
  mode = 'ready'; release(); await ready();
  assert.deepEqual(await values(), [9, 7, 2], 'Reloaded data replaces prior values');
  mode = 'error'; await page.reload();
  await page.locator('[data-dashboard-status] [role="alert"]').waitFor();
  await page.locator('.minimarket-toast-error').waitFor();
  assert.equal(await page.locator('[data-dashboard-content]').isVisible(), false);
  mode = 'ready';
  await page.locator('[data-dashboard-status]').getByRole('button', { name: 'Try again' }).click(); await ready();
  assert.deepEqual(await values(), [9, 7, 2]);
  assert.equal(await page.locator('.minimarket-toast-success').count(), 0);
  mode = 'late'; gate = new Promise((resolve) => { release = resolve; });
  await page.reload(); await page.locator('[data-dashboard-status][aria-busy="true"]').waitFor();
  await logout(); release();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('[data-dashboard-content]').count(), 0, 'Late requests cannot render after logout');
  await page.unroute('**/rest/v1/**');
  await page.goto(base + '/login'); await login('test@test.com'); await ready();
  assert.deepEqual(await values(), [8, 4, 6], 'Account change does not reuse previous statistics');
  await logout();
  assert.deepEqual(errors, []);
  console.log('PASS: protected Dashboard, exact per-user statistics for all demo users, real zero-data account, refresh, navigation/history, safe returns, responsive layout, loading/error/retry, quiet reads, and stale-response cleanup.');
} finally {
  await browser.close();
  if (temporaryUserId && admin) {
    const { data, error } = await admin.auth.admin.getUserById(temporaryUserId);
    if (error || data.user.app_metadata?.minimarket_dashboard_test !== true) throw new Error('Temporary account cleanup refused.');
    const removed = await admin.auth.admin.deleteUser(temporaryUserId);
    if (removed.error) throw new Error('Temporary Dashboard test account cleanup failed.');
    console.log('PASS: temporary account removed; existing accounts and marketplace records unchanged.');
  }
}
