import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readConfig } from './seed.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const base = process.env.LISTINGS_TEST_URL || 'http://127.0.0.1:5180';
const config = readConfig(parseEnv(await readFile('.env.seed.local', 'utf8')));
const admin = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicEnv = parseEnv(await readFile('.env.local', 'utf8'));
const fixtures = [];
const browserErrors = [];
const dialogs = [];
let dialogPolicy = 'dismiss';
page.on('pageerror', (error) => browserErrors.push(error.message));
page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog[dialogPolicy](); });
const check = (result, action) => { if (result.error) throw new Error(`${action} failed.`); return result.data; };
const waitPath = (path) => page.waitForURL((url) => url.pathname === path);
const formReady = () => page.locator('[data-listing-form]:not([hidden]) fieldset:not([disabled])').waitFor();
const listReady = () => page.locator('[data-my-listings-table]:not([hidden])').waitFor();
async function login(email, password) {
  await page.goto(base + '/login'); await page.locator('form').waitFor();
  await page.locator('form').getByLabel('Email', { exact: true }).fill(email);
  await page.locator('form').getByLabel('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button').click(); await waitPath('/dashboard');
}
async function logout() { await page.locator('[data-logout]').click(); await waitPath('/'); }
async function fill(data) {
  if ('title' in data) await page.locator('#listing-title').fill(data.title);
  if ('description' in data) await page.locator('#listing-description').fill(data.description);
  if ('price' in data) await page.locator('#listing-price').fill(data.price);
  if ('category_id' in data) await page.locator('#listing-category').selectOption(data.category_id);
}
const doubleSubmit = () => page.locator('[data-listing-form]').evaluate((form) => {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

try {
  for (const name of ['Owner', 'Other']) {
    const email = `minimarket-crud-${randomUUID()}@test.com`, password = randomUUID();
    const data = check(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { username: `CRUD ${name}` }, app_metadata: { minimarket_crud_test: true } }), 'Creating temporary account');
    fixtures.push({ ...data.user, email, password });
  }
  const [owner, other] = fixtures;
  let failWrite;
  let readMode = 'normal';
  let categoryMode = 'normal';
  let releaseRead;
  let readGate;
  const writes = { POST: 0, PATCH: 0, DELETE: 0 };
  let lastListingOrder;
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname.endsWith('/categories') && categoryMode !== 'normal') {
      return categoryMode === 'empty' ? route.fulfill({ json: [] }) : route.fulfill({ status: 503, json: {} });
    }
    if (!url.pathname.endsWith('/listings')) return route.continue();
    if (Object.hasOwn(writes, method)) {
      writes[method] += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (method === failWrite) return route.fulfill({ status: 503, json: { message: 'Controlled request failure' } });
    }
    const myRead = method === 'GET' && url.searchParams.has('owner_id') && url.searchParams.get('select')?.includes('category:categories');
    if (myRead) lastListingOrder = url.searchParams.get('order');
    if (myRead && readMode === 'loading') await readGate;
    if (myRead && readMode === 'error') return route.fulfill({ status: 503, json: {} });
    return route.continue();
  });
  await login(owner.email, owner.password);
  await page.locator('header a[href="/my-listings"]').click();
  await page.getByText('You haven’t posted any listings yet.', { exact: false }).waitFor();
  const cleanDialogs = dialogs.length;
  await page.locator('[data-add-listing]').click(); await formReady();
  await page.locator('[data-cancel-listing]').click(); await waitPath('/my-listings');
  assert.equal(dialogs.length, cleanDialogs, 'Pristine Cancel does not warn');

  await page.locator('[data-add-listing]').click(); await formReady();
  assert.equal(await page.locator('select option').count(), 7);
  await fill({ title: ' ', price: '-1' });
  await page.locator('[data-save-listing]').click();
  assert.equal(await page.locator('.is-invalid').count(), 3);
  assert.equal(writes.POST, 0);
  assert.equal(await page.locator('.minimarket-toast').count(), 0, 'Validation stays inline');
  const categoryId = await page.locator('#listing-category option').nth(1).getAttribute('value');
  const initialTitle = `Verification reading desk ${randomUUID()} ${'long title '.repeat(12)}<b>plain text</b>`;
  await fill({ title: initialTitle, price: '12.50', description: 'A temporary listing used only for verification.', category_id: categoryId });
  // Injecting an unrelated owner field must not affect the submitted owner.
  await page.locator('form').evaluate((form, id) => { const input = document.createElement('input'); input.type = 'hidden'; input.name = 'owner_id'; input.value = id; form.append(input); }, other.id);
  failWrite = 'POST';
  await doubleSubmit(); await page.locator('[data-save-error]:not([hidden])').waitFor();
  assert.equal(writes.POST, 1, 'Duplicate create submissions are prevented');
  assert.equal(await page.locator('#listing-title').inputValue(), initialTitle);
  assert.equal(await page.locator('#listing-price').inputValue(), '12.50');
  failWrite = null;
  const beforeSavedDialogs = dialogs.length;
  await page.locator('[data-save-listing]').click(); await waitPath('/my-listings'); await listReady();
  assert.equal(dialogs.length, beforeSavedDialogs, 'Successful save does not warn');
  assert.equal(await page.locator('.minimarket-toast-success').count(), 1);
  const listing = check(await admin.from('listings').select('*').eq('owner_id', owner.id).single(), 'Inspecting created listing');
  assert.equal(listing.owner_id, owner.id); assert.equal(listing.price, 12.5); assert.equal(listing.image_url, null);
  const row = () => page.locator(`[data-listing-id="${listing.id}"]`);
  assert.equal(await row().locator('.my-listing-title b').count(), 0);
  assert.equal(await row().locator('.my-listing-title').evaluate((element) => element.scrollWidth > element.clientWidth), true);
  assert.equal(await row().getByRole('link', { name: 'View' }).getAttribute('href'), `/listings/${listing.id}`);
  await row().getByRole('link', { name: 'View' }).click(); assert.equal(await page.locator('h1').textContent(), 'Listing Details');
  await page.goBack(); await listReady();

  await row().getByRole('link', { name: 'Edit' }).click(); await formReady();
  assert.equal(await page.locator('#listing-title').inputValue(), initialTitle);
  await page.locator('[data-cancel-listing]').click(); await listReady();
  await row().getByRole('link', { name: 'Edit' }).click(); await formReady();
  await fill({ title: 'Unsaved desk title' });
  await page.locator('[data-logout]').click();
  assert.equal(await page.locator('[data-logout]').isVisible(), true, 'Canceling an unsaved logout retains the session');
  assert.equal(await page.locator('#listing-title').inputValue(), 'Unsaved desk title');
  const beforeLinkWarning = dialogs.length;
  await page.locator('header a[href="/dashboard"]').click();
  assert.equal(dialogs.length, beforeLinkWarning + 1); assert.equal(new URL(page.url()).pathname, `/listings/${listing.id}/edit`);
  assert.equal(await page.locator('#listing-title').inputValue(), 'Unsaved desk title');
  await page.goBack(); await waitPath(`/listings/${listing.id}/edit`);
  assert.equal(await page.locator('#listing-title').inputValue(), 'Unsaved desk title', 'Canceled Back preserves form and URL');
  dialogPolicy = 'accept'; await page.goBack(); await waitPath('/my-listings'); await listReady();
  dialogPolicy = 'dismiss';
  await page.goForward(); await formReady();
  // Create a forward entry, then verify a dirty form can reject Forward too.
  await page.locator('header a[href="/listings"]').click();
  await page.goBack(); await formReady(); await fill({ title: 'Forward warning title' });
  await page.goForward(); await waitPath(`/listings/${listing.id}/edit`);
  assert.equal(await page.locator('#listing-title').inputValue(), 'Forward warning title');
  dialogPolicy = 'accept'; await page.goForward(); await waitPath('/listings');
  await page.goBack(); await formReady(); dialogPolicy = 'dismiss';
  await page.locator('#listing-title').click(); await fill({ title: 'Refresh warning title' });
  const beforeRefresh = dialogs.length;
  await page.reload().catch(() => {});
  assert.equal(dialogs.length, beforeRefresh + 1); assert.equal(dialogs.at(-1), 'beforeunload');
  assert.equal(await page.locator('#listing-title').inputValue(), 'Refresh warning title');
  dialogPolicy = 'accept'; await page.reload(); await formReady(); dialogPolicy = 'dismiss';
  assert.equal(await page.locator('#listing-title').inputValue(), initialTitle);
  const closingTab = await context.newPage();
  await closingTab.goto(base + `/listings/${listing.id}/edit`);
  await closingTab.locator('[data-listing-form]:not([hidden]) fieldset:not([disabled])').waitFor();
  await closingTab.locator('#listing-title').click(); await closingTab.locator('#listing-title').fill('Unsaved closing tab');
  let closeDialog = closingTab.waitForEvent('dialog');
  await closingTab.close({ runBeforeUnload: true });
  let warning = await closeDialog; assert.equal(warning.type(), 'beforeunload'); await warning.dismiss();
  assert.equal(await closingTab.locator('#listing-title').inputValue(), 'Unsaved closing tab');
  closeDialog = closingTab.waitForEvent('dialog'); const closed = closingTab.waitForEvent('close');
  await closingTab.close({ runBeforeUnload: true }); warning = await closeDialog; await warning.accept(); await closed;
  await fill({ title: 'Updated verification desk', description: 'Updated description', price: '25.75' });
  failWrite = 'PATCH'; await page.locator('[data-save-listing]').click(); await page.locator('[data-save-error]:not([hidden])').waitFor();
  assert.equal(await page.locator('#listing-title').inputValue(), 'Updated verification desk');
  assert.equal(await page.locator('#listing-description').inputValue(), 'Updated description');
  failWrite = null; await page.locator('[data-save-listing]').click(); await waitPath('/my-listings'); await listReady();
  const updated = check(await admin.from('listings').select('*').eq('id', listing.id).single(), 'Inspecting updated listing');
  assert.equal(updated.title, 'Updated verification desk'); assert.equal(updated.price, 25.75); assert.equal(updated.owner_id, owner.id);
  assert.equal(await page.locator('body').getAttribute('class'), null);

  await logout(); await login(other.email, other.password);
  await page.goto(base + '/my-listings'); await page.getByText('You haven’t posted any listings yet.', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-listing-rows] tr').count(), 0);
  await page.goto(base + `/listings/${listing.id}/edit`);
  await page.getByText('This listing is unavailable', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-listing-form]').isVisible(), false);
  const otherClient = createClient(publicEnv.VITE_SUPABASE_URL, publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  check(await otherClient.auth.signInWithPassword({ email: other.email, password: other.password }), 'Signing in for RLS verification');
  const forbiddenUpdate = await otherClient.from('listings').update({ title: 'Must not change' }).eq('id', listing.id).select('id');
  assert.ok(forbiddenUpdate.error || forbiddenUpdate.data.length === 0);
  const forbiddenDelete = await otherClient.from('listings').delete().eq('id', listing.id).select('id');
  assert.ok(forbiddenDelete.error || forbiddenDelete.data.length === 0);
  assert.equal(check(await admin.from('listings').select('title').eq('id', listing.id).single(), 'Checking RLS protection').title, updated.title);
  await page.goto(base + '/listings/not-a-uuid/edit'); await page.getByText('This listing is unavailable', { exact: false }).waitFor();
  await page.goto(base + `/listings/${randomUUID()}/edit`); await page.getByText('This listing is unavailable', { exact: false }).waitFor();

  await logout(); await login('admin@admin.com', 'pass123');
  await page.goto(base + `/listings/${listing.id}/edit`); await formReady();
  await fill({ title: 'Administrator-reviewed verification desk' });
  await page.locator('[data-save-listing]').click(); await waitPath('/my-listings');
  assert.equal(check(await admin.from('listings').select('owner_id').eq('id', listing.id).single(), 'Checking preserved owner').owner_id, owner.id);
  await logout(); await login(owner.email, owner.password); await page.goto(base + '/my-listings'); await listReady();
  check(await admin.from('favorites').insert({ user_id: other.id, listing_id: listing.id }), 'Creating temporary cascade fixture');
  await row().getByRole('button', { name: /^Delete/ }).click();
  await page.locator('#delete-listing-modal.show').waitFor();
  assert.equal(await page.locator('[data-delete-title]').textContent(), 'Administrator-reviewed verification desk');
  await page.locator('#delete-listing-modal').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(check(await admin.from('listings').select('id').eq('id', listing.id).single(), 'Checking canceled delete').id, listing.id);
  await row().getByRole('button', { name: /^Delete/ }).click();
  failWrite = 'DELETE';
  await page.locator('[data-confirm-delete]').click(); await page.locator('[data-delete-error]:not([hidden])').waitFor();
  assert.equal(await page.locator('#delete-listing-modal').isVisible(), true);
  failWrite = null;
  const beforeDelete = writes.DELETE;
  await page.locator('[data-confirm-delete]').evaluate((button) => { button.click(); button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.getByText('You haven’t posted any listings yet.', { exact: false }).waitFor();
  assert.equal(writes.DELETE, beforeDelete + 1);
  assert.equal(await page.locator('[data-listing-rows] tr').count(), 0);
  assert.equal(check(await admin.from('listings').select('id').eq('id', listing.id).maybeSingle(), 'Checking deleted row'), null);
  assert.equal(check(await admin.from('favorites').select('id').eq('listing_id', listing.id), 'Checking favorites cascade').length, 0);
  assert.equal(await page.locator('.modal-backdrop').count(), 0); assert.equal(await page.locator('body.modal-open').count(), 0);

  categoryMode = 'empty'; await page.locator('[data-add-listing]').click(); await page.getByText('No categories are available', { exact: false }).waitFor();
  categoryMode = 'error'; await page.locator('[data-listing-form-status]').getByRole('button').click(); await page.getByText('The form could not be loaded', { exact: false }).waitFor();
  categoryMode = 'normal'; await page.locator('[data-listing-form-status]').getByRole('button').click(); await formReady();
  await page.locator('[data-cancel-listing]').click();
  readMode = 'error'; await page.reload(); await page.getByText('Your listings could not be loaded', { exact: false }).first().waitFor();
  readMode = 'loading'; readGate = new Promise((resolve) => { releaseRead = resolve; });
  await page.locator('[data-my-listings-status]').getByRole('button').click();
  await page.locator('[data-my-listings-status][aria-busy="true"]').waitFor();
  readMode = 'normal'; releaseRead(); await page.getByText('You haven’t posted any listings yet.', { exact: false }).waitFor();
  await logout(); await login('test@test.com', 'pass123'); await page.goto(base + '/my-listings'); await listReady();
  assert.equal(await page.locator('[data-listing-rows] tr').count(), 8);
  assert.equal(lastListingOrder, 'created_at.desc,id.desc');
  await mkdir('node_modules/.crud-verification', { recursive: true });
  await page.screenshot({ path: 'node_modules/.crud-verification/my-listings-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.table-responsive').evaluate((element) => element.scrollWidth > element.clientWidth), true);
  await page.screenshot({ path: 'node_modules/.crud-verification/my-listings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-add-listing]').click(); await formReady();
  await page.screenshot({ path: 'node_modules/.crud-verification/form-desktop.png', fullPage: true });
  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-cancel-listing]').click(); await logout();
  assert.deepEqual(browserErrors, []);
  console.log('PASS: live own-listing table and CRUD, categories, field validation, preserved failed saves, duplicate prevention, owner/admin permissions and RLS denial, modal cancel/delete, FK cascade, dirty links/Back/Forward/refresh, page states, and responsive layouts.');
} finally {
  await browser.close();
  for (const fixture of fixtures) {
    const user = check(await admin.auth.admin.getUserById(fixture.id), 'Checking temporary account');
    if (user.user.app_metadata?.minimarket_crud_test !== true) throw new Error('Temporary account cleanup refused.');
    check(await admin.auth.admin.deleteUser(fixture.id), 'Removing temporary account');
  }
  if (fixtures.length) console.log('PASS: temporary accounts/listings/favorites removed; existing accounts and seed records untouched.');
}
