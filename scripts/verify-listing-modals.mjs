// Optional browser QA with temporary, marked fixtures; no application dependency.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readConfig } from './seed.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const config = readConfig(parseEnv(await readFile('.env.seed.local', 'utf8')));
const admin = createClient(config.url, config.key, { auth: { persistSession:false, autoRefreshToken:false } });
const publicEnv = parseEnv(await readFile('.env.local', 'utf8'));
const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
const base = process.env.LISTING_MODALS_TEST_URL || 'http://127.0.0.1:5180';
const fixtures = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let acceptDiscard = false;
let dialogCount = 0;
page.on('dialog', async dialog => { dialogCount++; await dialog[acceptDiscard ? 'accept' : 'dismiss'](); });
const check = (result, action) => { if (result.error) throw new Error(`${action} failed.`); return result.data; };
const modal = () => page.locator('#listing-form-modal');
const ready = async () => {
  await modal().locator('[data-listing-form]:not([hidden]) [data-listing-fields]:not([disabled])').waitFor();
  await modal().locator('[data-save-listing]:not([disabled])').waitFor();
};
const tableReady = () => page.locator('[data-my-listings-table]:not([hidden])').waitFor();
const writes = { POST:0, PATCH:0, DELETE:0 };
let failWrite;
let detailMode = 'normal';
let releaseRead;
let readGate;
const fill = async (title, price, category, description = '') => {
  await modal().locator('#listing-title').fill(title);
  await modal().locator('#listing-price').fill(price);
  await modal().locator('#listing-category').selectOption(category);
  await modal().locator('#listing-description').fill(description);
};
const doubleSubmit = () => modal().locator('form').evaluate(form => {
  for (let i=0; i<2; i++) form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
});
async function login(user) {
  await page.goto(`${base}/login`);
  await page.waitForFunction(() => location.pathname !== '/login' || document.querySelector('form[aria-label="Login"]'));
  if (new URL(page.url()).pathname !== '/login') {
    await page.locator('[data-logout]:not([hidden])').click();
    await page.waitForURL(url => url.pathname === '/');
    await page.goto(`${base}/login`);
  }
  await page.getByLabel('Email', { exact:true }).fill(user.email);
  await page.getByLabel('Password', { exact:true }).fill(user.password);
  await page.getByRole('button', { name:'Login', exact:true }).click();
  await page.waitForURL(url => url.pathname === '/dashboard');
}
async function noBackdrop() {
  await page.locator('.modal-backdrop').waitFor({ state:'detached' });
  assert.equal(await page.locator('.modal-backdrop').count(), 0);
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('modal-open')), false);
}
try {
  await mkdir('node_modules/.listing-modals-verification', { recursive:true });
  for (const username of ['Modal Owner','Modal Other']) {
    const email = `minimarket-modal-${randomUUID()}@test.com`, password = randomUUID();
    const data = check(await admin.auth.admin.createUser({ email, password, email_confirm:true, user_metadata:{ username }, app_metadata:{ minimarket_modals_test:true } }), 'Creating marked temporary user');
    fixtures.push({ ...data.user, email, password });
  }
  const [owner, other] = fixtures;
  await page.route('**/rest/v1/listings?*', async route => {
    const request = route.request(), method = request.method(), url = new URL(request.url());
    if (Object.hasOwn(writes,method)) {
      writes[method]++;
      await new Promise(resolve => setTimeout(resolve, 200));
      if (failWrite === method) return route.fulfill({ status:503, json:{ message:'private internal error' } });
    }
    if (method === 'GET' && url.searchParams.has('id')) {
      if (detailMode === 'loading') await readGate;
      if (detailMode === 'missing') return route.fulfill({ json:[] });
      if (detailMode === 'error') return route.fulfill({ status:503, json:{} });
    }
    return route.continue();
  });
  // Public View preserves Browse filters and supports loading, escape, and focus return.
  await page.goto(`${base}/listings?category=electronics&sort=price-asc`);
  await page.locator('[data-listing-link]').first().waitFor();
  const firstTitle = await page.locator('[data-listing-title]').first().textContent();
  const href = await page.locator('[data-listing-link]').first().getAttribute('href');
  detailMode = 'loading'; readGate = new Promise(resolve => { releaseRead = resolve; });
  await page.locator('[data-listing-link]').first().click();
  await page.getByText('Loading listing…', { exact:true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('category'), 'electronics');
  detailMode = 'normal'; releaseRead();
  await page.locator('#view-listing-modal [data-details-content]:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-details-title]').textContent(), firstTitle);
  await page.keyboard.press('Escape');
  await noBackdrop();
  assert.equal(await page.locator('[data-listing-link]').first().evaluate(node => node === document.activeElement), true);
  const secondTitle = await page.locator('[data-listing-title]').nth(1).textContent();
  detailMode = 'loading'; readGate = new Promise(resolve => { releaseRead=resolve; });
  await page.locator('[data-listing-link]').first().click();
  await page.getByText('Loading listing…', { exact:true }).waitFor();
  await page.keyboard.press('Escape');
  detailMode = 'normal';
  await page.locator('[data-listing-link]').nth(1).click();
  await page.locator('[data-details-content]:not([hidden])').waitFor();
  releaseRead(); await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-details-title]').textContent(), secondTitle, 'Late previous read cannot replace another listing');
  for (let i=0;i<8;i++) await page.keyboard.press('Tab');
  assert.equal(await page.locator('#view-listing-modal').evaluate(node => node.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');
  detailMode = 'missing'; await page.locator('[data-listing-link]').first().click();
  await page.getByText('This listing is no longer available.', { exact:true }).waitFor();
  await page.getByRole('button', { name:'Close', exact:true }).click();
  detailMode = 'error'; await page.locator('[data-listing-link]').first().click();
  await page.getByRole('button', { name:'Try again', exact:true }).waitFor();
  detailMode = 'normal'; await page.getByRole('button', { name:'Try again', exact:true }).click();
  await page.locator('[data-details-content]:not([hidden])').waitFor();
  await page.getByRole('link', { name:'Open details page' }).click();
  await page.waitForURL(url => url.pathname === href);
  await page.locator('[data-details-content]:not([hidden])').waitFor();
  await noBackdrop();
  await page.reload(); await page.locator('[data-details-content]:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-details-title]').textContent(), firstTitle);
  await page.goto(`${base}/listings/not-a-uuid`);
  await page.getByText('This listing is no longer available.', { exact:true }).waitFor();
  console.log('PASS: anonymous View, loading/missing/error/retry, safe direct details route/refresh, filter preservation, escape, and focus restoration.');

  await login(owner); await page.goto(`${base}/my-listings`);
  await page.getByText('You haven’t posted any listings yet.', { exact:false }).waitFor();
  await page.locator('[data-add-listing]').click(); await ready();
  assert.equal(new URL(page.url()).pathname, '/my-listings');
  await modal().locator('[data-save-listing]').click();
  assert.equal(await modal().locator('.is-invalid').count(), 3);
  assert.equal(writes.POST, 0);
  await modal().locator('[data-cancel-listing]').click(); await noBackdrop();
  await page.locator('[data-add-listing]').click(); await ready();
  const category = await modal().locator('#listing-category option').nth(1).getAttribute('value');
  const title = `Modal desk ${randomUUID()}`;
  const description = '<script>alert("plain text")</script>\nA fictional test item.';
  await fill(title, '12.50', category, description);
  const dialogsBefore = dialogCount;
  await page.keyboard.press('Escape');
  assert.equal(await modal().isVisible(), true);
  assert.equal(dialogCount, dialogsBefore+1);
  assert.equal(writes.POST, 0);
  // Failed writes retain fields; double submissions issue only one request.
  await modal().locator('form').evaluate((form,id) => { const input=document.createElement('input'); input.name='owner_id'; input.value=id; input.type='hidden'; form.append(input); }, other.id);
  failWrite = 'POST'; await doubleSubmit();
  await modal().locator('[data-save-error]:not([hidden])').waitFor();
  assert.equal(writes.POST, 1);
  assert.equal(await modal().locator('#listing-title').inputValue(), title);
  failWrite = undefined; await doubleSubmit(); await tableReady();
  assert.equal(writes.POST, 2); await noBackdrop();
  await page.locator('.minimarket-toast-success').filter({ hasText:'Listing created successfully.' }).waitFor();
  const listing = check(await admin.from('listings').select('*').eq('owner_id',owner.id).single(), 'Reading temporary listing');
  assert.equal(listing.owner_id,owner.id); assert.equal(listing.price,12.5);
  const row = () => page.locator(`tr[data-listing-id="${listing.id}"]`);
  await row().getByRole('link', { name:'View', exact:true }).click();
  await page.locator('[data-details-content]:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-details-description]').textContent(), description);
  assert.equal(await page.locator('[data-details-description] script').count(),0);
  await page.getByRole('button', { name:'Close', exact:true }).click();
  await row().getByRole('link', { name:'Edit', exact:true }).click(); await ready();
  assert.equal(await modal().locator('#listing-title').inputValue(), title);
  await modal().locator('#listing-title').fill(`${title} changed`);
  await modal().locator('[data-cancel-listing]').click();
  assert.equal(await modal().isVisible(),true);
  acceptDiscard=true; await modal().locator('[data-cancel-listing]').click(); acceptDiscard=false;
  assert.equal(writes.PATCH,0); await noBackdrop();
  await row().getByRole('link', { name:'Edit', exact:true }).click(); await ready();
  assert.equal(await modal().locator('#listing-title').inputValue(),title, 'Cancel does not save');
  await modal().locator('#listing-title').fill(`${title} updated`);
  failWrite='PATCH'; await doubleSubmit(); await modal().locator('[data-save-error]:not([hidden])').waitFor();
  assert.equal(writes.PATCH,1);
  failWrite=undefined; await doubleSubmit();
  await page.waitForFunction(id => document.querySelector(`tr[data-listing-id="${id}"] .my-listing-title`)?.textContent.endsWith('updated'), listing.id);
  await noBackdrop(); assert.equal(writes.PATCH,2);
  await page.locator('.minimarket-toast-success').filter({ hasText:'Listing updated successfully.' }).waitFor();
  assert.equal(await page.locator('[data-add-listing]').evaluate(node => node === document.activeElement),true);
  console.log('PASS: modal create/edit, field validation, cancel/discard warning, failed-save retention, duplicate prevention, owner spoof rejection, table refresh, and focus fallback.');

  // Existing page forms remain functional, including admin permission and RLS denial.
  await page.goto(`${base}/listings/add`); await page.locator('[data-listing-form]:not([hidden])').waitFor();
  await page.goto(`${base}/listings/${listing.id}/edit`); await page.locator('[data-listing-form]:not([hidden])').waitFor();
  await login(other); await page.goto(`${base}/listings/${listing.id}/edit`);
  await page.getByText('This listing is unavailable or you do not have permission to edit it.', { exact:true }).waitFor();
  const otherClient = createClient(config.url,publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY,{ auth:{ persistSession:false,autoRefreshToken:false } });
  check(await otherClient.auth.signInWithPassword({ email:other.email,password:other.password }), 'Signing in temporary other user');
  const deniedUpdate = await otherClient.from('listings').update({ title:'Forbidden' }).eq('id',listing.id).select('id');
  assert.ok(deniedUpdate.error || deniedUpdate.data.length===0);
  const deniedDelete = await otherClient.from('listings').delete().eq('id',listing.id).select('id');
  assert.ok(deniedDelete.error || deniedDelete.data.length===0);
  await otherClient.auth.signOut();
  await login({ email:'admin@admin.com',password:'pass123' });
  await page.goto(`${base}/listings/${listing.id}/edit`); await page.locator('[data-listing-form]:not([hidden])').waitFor();
  await page.locator('#listing-price').fill('15'); await page.locator('[data-save-listing]').click();
  await page.waitForURL(url => url.pathname==='/my-listings');
  const afterAdmin=check(await admin.from('listings').select('owner_id,price').eq('id',listing.id).single(),'Verifying admin edit');
  assert.equal(afterAdmin.owner_id,owner.id); assert.equal(afterAdmin.price,15);
  await login(owner); await page.goto(`${base}/my-listings`); await tableReady();
  await row().getByRole('button', { name:/Delete/ }).click();
  await page.locator('#delete-listing-modal').getByRole('button', { name:'Cancel',exact:true }).click();
  assert.equal(writes.DELETE,0);
  await row().getByRole('button', { name:/Delete/ }).click(); failWrite='DELETE';
  await page.locator('[data-confirm-delete]').evaluate(button => { button.click(); button.click(); });
  await page.locator('[data-delete-error]:not([hidden])').waitFor();
  assert.equal(writes.DELETE,1);
  await page.locator('.minimarket-toast-error').filter({ hasText:'The listing could not be deleted.' }).waitFor();
  failWrite=undefined; await page.locator('[data-confirm-delete]').click();
  await page.getByText('You haven’t posted any listings yet.', { exact:false }).waitFor();
  assert.equal(writes.DELETE,2); await noBackdrop();
  await page.locator('.minimarket-toast-success').filter({ hasText:'Listing deleted successfully.' }).waitFor();
  assert.equal(check(await admin.from('listings').select('id').eq('id',listing.id),'Checking deletion').length,0);
  for (const width of [1440,768,375,320]) {
    await page.setViewportSize({ width,height:900 });
    await page.locator('[data-add-listing]').click();
    await ready();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await modal().evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    if ([1440,375].includes(width)) await page.screenshot({ path:`node_modules/.listing-modals-verification/${width}.png` });
    await modal().locator('[data-cancel-listing]').click(); await noBackdrop();
  }
  await page.setViewportSize({ width:1440,height:1000 });
  await page.locator('header a[href="/dashboard"]').click();
  await page.waitForURL(url => url.pathname==='/dashboard');
  await page.locator('header a[href="/my-listings"]').click();
  await page.getByText('You haven’t posted any listings yet.', { exact:false }).waitFor();
  await page.locator('[data-add-listing]').click(); await ready();
  await modal().locator('#listing-title').fill('Discard on history');
  const path=page.url(); await page.goBack();
  await page.waitForURL(url => url.href===path);
  assert.equal(page.url(),path);
  assert.equal(await modal().isVisible(),true);
  acceptDiscard=true; await page.goBack(); await page.waitForTimeout(100); acceptDiscard=false;
  await page.waitForTimeout(100); await noBackdrop();
  assert.equal(await page.locator('#listing-form-modal').count(),0,'Navigation disposes modal host');
  assert.deepEqual(errors,[]);
  console.log('PASS: preserved Add/Edit/Details routes, real non-owner RLS denials, admin edit/owner preservation, delete cancel/failure/retry, responsive modals, and history/disposal cleanup.');
} finally {
  await browser.close();
  for (const fixture of fixtures) {
    const result=await admin.auth.admin.getUserById(fixture.id);
    if (result.data?.user?.app_metadata?.minimarket_modals_test===true) check(await admin.auth.admin.deleteUser(fixture.id),'Removing marked temporary user');
  }
  console.log(`Cleaned up ${fixtures.length} marked temporary accounts and their related records.`);
}
