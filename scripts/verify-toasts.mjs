import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const base = process.env.TOAST_TEST_URL || 'http://127.0.0.1:5180';
// Use the app's current module URLs, including Vite's hot-reload versions.
const mainSource = await (await fetch(base + '/src/main.js')).text();
const toastPath = mainSource.match(/from\s+["']([^"']*\/toast-service\.js[^"']*)["']/)[1];
const toastSource = await (await fetch(new URL(toastPath, base))).text();
const feedbackPath = toastSource.match(/from\s+["']([^"']*\/operation-feedback\.js[^"']*)["']/)[1];
await page.addInitScript(({ toastPath, feedbackPath }) => {
  window.__toastTestPath = toastPath;
  window.__feedbackTestPath = feedbackPath;
}, { toastPath, feedbackPath });
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(error.message));
const call = (method, message) => page.evaluate(async ({ method, message }) => {
  const service = await import(window.__toastTestPath);
  service[method](message);
}, { method, message });
const clear = () => page.evaluate(async () => (await import(window.__toastTestPath)).clearToasts());
try {
  await page.goto(base);
  await page.locator('.listing-card').first().waitFor();
  assert.equal(await page.locator('#minimarket-toasts').count(), 1);
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Page opens and successful reads are quiet');
  await call('showSuccess', 'Your changes were saved.');
  await call('showError', 'The listing could not be saved. Please try again.');
  await call('showInfo', 'Please review the details before continuing.');
  assert.equal(await page.locator('.minimarket-toast').count(), 3);
  assert.equal(await page.locator('.minimarket-toast-error').getAttribute('role'), 'alert');
  assert.equal(await page.locator('.minimarket-toast-success').getAttribute('role'), 'status');
  assert.equal(await page.locator('[data-toast-region="assertive"]').getAttribute('aria-live'), 'assertive');
  assert.equal(await page.locator('[data-toast-region="polite"]').getAttribute('aria-live'), 'polite');
  await call('showError', 'The listing could not be saved. Please try again.');
  assert.equal(await page.locator('.minimarket-toast-error').count(), 1);
  await mkdir('node_modules/.toast-verification', { recursive: true });
  await page.screenshot({ path: 'node_modules/.toast-verification/desktop.png' });
  await page.locator('.minimarket-toast-error').getByRole('button', { name: 'Dismiss notification' }).click();
  assert.equal(await page.locator('.minimarket-toast-error').count(), 0);
  await call('showError', 'The listing could not be saved. Please try again.');
  assert.equal(await page.locator('.minimarket-toast-error').count(), 0, 'A rapid repeat after dismissal is suppressed');
  await clear();
  await call('showInfo', '<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('[data-toast-message]').textContent(), '<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('[data-toast-message] img').count(), 0);
  await clear();
  await call('showError', 'sb_secret_mock_sensitive_value');
  assert.equal(await page.locator('[data-toast-message]').textContent(), 'Something went wrong. Please try again.');
  await clear();
  await call('showError', '23505');
  assert.equal(await page.locator('[data-toast-message]').textContent(), 'Something went wrong. Please try again.');
  await clear();
  await page.evaluate(async () => {
    const { showError } = await import(window.__toastTestPath);
    showError(new Error('Internal details that must not appear'));
  });
  assert.equal(await page.locator('[data-toast-message]').textContent(), 'Something went wrong. Please try again.');
  await clear();
  await call('showSuccess', 'Saved before navigation.');
  await page.locator('header a[href="/listings"]').click();
  assert.equal(await page.locator('#minimarket-toasts').count(), 1);
  assert.equal(await page.locator('.minimarket-toast-success').count(), 1, 'Toast survives History API navigation');
  await page.evaluate(async () => { const service = await import(window.__toastTestPath); service.initializeToasts(); service.initializeToasts(); });
  assert.equal(await page.locator('#minimarket-toasts').count(), 1);
  await clear();
  await page.setViewportSize({ width: 320, height: 700 });
  await call('showInfo', 'A long but useful message that wraps comfortably on small screens without pushing the notification outside the viewport.');
  const box = await page.locator('.minimarket-toast').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 320);
  await page.screenshot({ path: 'node_modules/.toast-verification/mobile.png' });
  await page.locator('.minimarket-toast').getByRole('button').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Keyboard dismissal works');
  await clear();
  await page.mouse.move(0, 690);
  await call('showSuccess', 'This routine notification will disappear.');
  await page.locator('.minimarket-toast').waitFor({ state: 'detached', timeout: 6500 });
  await call('showError', 'This error notification will disappear too.');
  await page.locator('.minimarket-toast').waitFor({ state: 'detached', timeout: 8500 });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { notifyMutation } = await import(window.__feedbackTestPath);
    try {
      await notifyMutation(async () => { throw new Error('Never display raw backend details'); }, { error: 'The action could not be completed.' });
    } catch (error) {
      window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: error }));
    }
  });
  assert.equal(await page.locator('.minimarket-toast').count(), 1, 'A reported failed action is not toasted again by the global handler');
  await clear();
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { error: new Error('private raw details'), message: 'private raw details' })));
  assert.equal(await page.locator('[data-toast-message]').textContent(), 'Something went wrong. Please try again.');
  await clear();
  await page.evaluate(async () => {
    const { showInfo } = await import(window.__toastTestPath);
    for (let index = 0; index < 5; index += 1) showInfo(`Notification ${index}`);
  });
  assert.equal(await page.locator('.minimarket-toast').count(), 3, 'Stack is bounded on small screens');
  await page.evaluate(async () => (await import(window.__toastTestPath)).disposeToasts());
  assert.equal(await page.locator('#minimarket-toasts').count(), 0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('minimarket:operation-feedback', { detail: { type: 'success', message: 'Must not appear after cleanup' } })));
  assert.equal(await page.locator('#minimarket-toasts').count(), 0, 'Cleanup removes event listeners');
  await page.evaluate(async () => (await import(window.__toastTestPath)).initializeToasts());
  await page.goto(base + '/login');
  await page.route('**/auth/v1/token*', (route) => route.fulfill({ status: 400, json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }));
  await page.locator('form').getByLabel('Email', { exact: true }).fill('mock@example.com');
  await page.locator('form').getByLabel('Password', { exact: true }).fill('mock-password');
  await page.locator('form').getByRole('button').click();
  await page.locator('[data-auth-message]').filter({ hasText: 'Email or password is incorrect' }).waitFor();
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Authentication errors remain inline');
  await page.locator('form').getByLabel('Email', { exact: true }).fill('invalid');
  await page.locator('form').getByRole('button').click();
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Validation remains inline');
  await page.unroute('**/auth/v1/token*');
  await page.locator('form').getByLabel('Email', { exact: true }).fill('test@test.com');
  await page.locator('form').getByLabel('Password', { exact: true }).fill('pass123');
  await page.locator('form').getByRole('button').click();
  await page.waitForURL((url) => url.pathname === '/dashboard');
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Successful login remains quiet');
  await page.goto(base + '/admin');
  await page.waitForURL((url) => url.pathname === '/my-listings');
  await page.locator('.minimarket-toast-error').waitFor();
  assert.match(await page.locator('[data-toast-message]').textContent(), /permission/);
  await clear();
  await page.locator('[data-logout]').click();
  await page.waitForURL((url) => url.pathname === '/');
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Logout does not add routine notifications');
  assert.deepEqual(browserErrors, []);
  console.log('PASS: toast variants, auto/manual/keyboard dismissal, deduplication, safe messages, live regions, responsive placement, router persistence, stack limit, cleanup, and inline auth/validation behavior. No database writes.');
} finally { await browser.close(); }
