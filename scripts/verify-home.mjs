// Optional browser QA tool; Playwright is not an application dependency.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const base = process.env.HOME_TEST_URL || 'http://127.0.0.1:5180';
const artifacts = 'node_modules/.home-verification';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const categoryRegion = '[data-home-categories]';
const listingRegion = '[data-home-listings]';
const waitReady = () => page.waitForFunction(() => document.querySelectorAll('.home-category').length === 6 && document.querySelectorAll('.listing-card').length === 8);
const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

try {
  let latestResponse;
  page.on('response', async (response) => {
    if (response.url().includes('/rest/v1/listings?')) {
      latestResponse = response;
    }
  });
  await page.goto(base);
  await waitReady();
  assert.equal(await page.title(), 'Home | MiniMarket');
  assert.equal(await page.locator('h1').count(), 1);
  const requestUrl = new URL(latestResponse.url());
  assert.equal(requestUrl.searchParams.get('limit'), '8');
  assert.equal(requestUrl.searchParams.get('order'), 'created_at.desc,id.desc');
  const data = await latestResponse.json();
  assert.equal(data.length, 8);
  assert.ok(data.every((listing, index) => !index || Date.parse(data[index - 1].created_at) >= Date.parse(listing.created_at)));
  assert.deepEqual(await page.locator('[data-listing-title]').allTextContents(), data.map((listing) => listing.title));
  assert.deepEqual(await page.locator('[data-listing-category]').allTextContents(), data.map((listing) => listing.category.name));
  assert.ok((await page.locator('[data-listing-price]').first().textContent()).startsWith('€'));
  await noOverflow();
  await page.screenshot({ path: `${artifacts}/desktop.png`, fullPage: true });
  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow();
    if (width === 375) await page.screenshot({ path: `${artifacts}/mobile.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.evaluate(() => { window.shellMarker = true; });
  await page.getByLabel('Search advertisements', { exact: true }).fill('  chair & lamp  ');
  await page.locator('[data-home-search]').getByRole('button').click();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'chair & lamp');
  assert.equal(await page.locator('h1').textContent(), 'Browse Listings');
  assert.equal(await page.evaluate(() => window.shellMarker), true, 'Search uses the existing SPA router');
  await page.goBack(); await waitReady();
  await page.goForward(); assert.equal(new URL(page.url()).searchParams.get('q'), 'chair & lamp');
  await page.goBack(); await waitReady();
  await page.locator('[data-home-search]').getByRole('button').click();
  assert.equal(new URL(page.url()).search, '');
  await page.goBack(); await waitReady();
  const categoryHref = await page.locator('.home-category').first().getAttribute('href');
  await page.locator('.home-category').first().click();
  assert.equal(new URL(page.url()).search, new URL(categoryHref, base).search);
  assert.equal(await page.locator('h1').textContent(), 'Browse Listings');
  await page.goBack(); await waitReady();
  const listingHref = await page.locator('[data-listing-link]').first().getAttribute('href');
  await page.locator('[data-listing-link]').first().click();
  assert.equal(new URL(page.url()).pathname, listingHref);
  assert.equal(await page.locator('h1').textContent(), 'Listing Details');
  await page.goBack(); await waitReady();
  for (const [name, heading] of [['Browse Listings', 'Browse Listings'], ['Post an Ad', 'Login'], ['Join MiniMarket', 'Register'], ['Log in', 'Login']]) {
    await page.locator('.home-page').getByRole('link', { name, exact: true }).click();
    assert.equal(await page.locator('h1').textContent(), heading);
    await page.goBack(); await waitReady();
  }
  await page.reload(); await waitReady();

  // Controlled responses exercise page states without changing any database data.
  let release;
  let mode = 'loading';
  let categoryFailure = true;
  const gate = new Promise((resolve) => { release = resolve; });
  const category = { id: '20000000-0000-4000-8000-000000000001', name: 'Books' };
  const fixture = { id: '30000000-0000-4000-8000-000000000001', title: '<img src=x onerror=alert(1)>', price: 0, category: { name: '__proto__' }, image_url: 'javascript:alert(1)' };
  await page.route('**/rest/v1/**', async (route) => {
    const categories = new URL(route.request().url()).pathname.endsWith('/categories');
    if (mode === 'loading') await gate;
    if (mode === 'empty' || mode === 'loading') return route.fulfill({ json: [] });
    if (mode === 'error' || (mode === 'partial' && categories && categoryFailure)) {
      return route.fulfill({ status: 503, json: { message: 'Temporary failure' } });
    }
    return route.fulfill({ json: categories ? [category] : [fixture] });
  });
  await page.goto(base);
  await page.locator(`${categoryRegion}[aria-busy="true"]`).waitFor();
  await page.locator(`${listingRegion}[aria-busy="true"]`).waitFor();
  assert.match(await page.locator(categoryRegion).textContent(), /Loading/);
  assert.match(await page.locator(listingRegion).textContent(), /Loading/);
  mode = 'empty'; release();
  await page.getByText('No listings yet.', { exact: false }).waitFor();
  assert.match(await page.locator(categoryRegion).textContent(), /Categories are on their way/);
  mode = 'error'; await page.reload();
  await page.locator(`${categoryRegion} [role="alert"]`).waitFor();
  await page.locator(`${listingRegion} [role="alert"]`).waitFor();
  assert.equal(await page.locator('.minimarket-toast-error').count(), 1, 'A combined Home load failure has one notification');
  mode = 'content';
  await page.locator(listingRegion).getByRole('button', { name: 'Try again' }).click();
  await page.locator('.listing-card').waitFor();
  mode = 'partial'; await page.reload();
  await page.locator('.listing-card').waitFor();
  await page.locator(`${categoryRegion} [role="alert"]`).waitFor();
  assert.equal(await page.locator('[data-listing-title]').textContent(), fixture.title);
  assert.equal(await page.locator('[data-listing-title] img').count(), 0, 'Database text is not parsed as HTML');
  assert.equal(await page.locator('[data-listing-image]').getAttribute('src'), null, 'Unsafe image URLs are not used');
  assert.equal(await page.locator('[data-image-placeholder]').isVisible(), true);
  categoryFailure = false;
  await page.locator(categoryRegion).getByRole('button', { name: 'Try again' }).click();
  await page.locator('.home-category').waitFor();
  assert.equal(await page.locator('.home-category').textContent(), 'Books');

  await page.route('https://home-test.invalid/**', (route) => route.fulfill({
    status: route.request().url().endsWith('missing.jpg') ? 404 : 200,
    contentType: route.request().url().endsWith('missing.jpg') ? 'text/plain' : 'image/svg+xml',
    body: route.request().url().endsWith('missing.jpg') ? 'Image unavailable' : '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="green"/></svg>',
  }));
  mode = 'content';
  fixture.image_url = 'https://home-test.invalid/cover.svg';
  await page.reload();
  await page.locator('[data-listing-image]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-listing-image]')?.naturalWidth === 80);
  assert.equal(await page.locator('[data-image-placeholder]').isVisible(), false);
  fixture.image_url = 'https://home-test.invalid/missing.jpg';
  await page.reload();
  await page.locator('.listing-card').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-listing-image]')?.hidden === true);
  assert.equal(await page.locator('[data-image-placeholder]').isVisible(), true, 'Broken images return to the placeholder');

  // An error response arriving after navigation must not replace the next page.
  let finishLate;
  const late = new Promise((resolve) => { finishLate = resolve; });
  await page.unroute('**/rest/v1/**');
  await page.route('**/rest/v1/**', async (route) => { await late; await route.fulfill({ status: 503, json: {} }); });
  await page.goto(base);
  await page.locator('[data-home-search]').evaluate((form) => { window.oldSearch = form; });
  await page.getByRole('link', { name: 'Post an Ad', exact: true }).click();
  finishLate();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('h1').textContent(), 'Login');
  assert.equal(await page.evaluate(() => {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    window.oldSearch.dispatchEvent(event);
    return event.defaultPrevented;
  }), false, 'Unmount removes form listeners');
  assert.deepEqual(errors, []);
  console.log('PASS: live Home data, latest ordering/limit, links, search, history, refresh, desktop/tablet/mobile, loading/empty/error/retry, safe rendering, and unmount cleanup.');
} finally {
  await browser.close();
}
