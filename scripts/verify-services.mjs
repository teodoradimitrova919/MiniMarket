import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { fileURLToPath } from 'node:url';

const feedback = [];
globalThis.window = new EventTarget();
window.addEventListener('minimarket:operation-feedback', (event) => feedback.push(event.detail));

// Replace only the shared client; execute the actual service and utility modules.
async function loadServices(client) {
  const modules = new Map();
  const clientUrl = new URL('../src/services/supabase-client.js', import.meta.url).href;
  const replacement = new SyntheticModule(['supabase'], function () { this.setExport('supabase', client); });
  async function load(url) {
    if (url === clientUrl) return replacement;
    if (!modules.has(url)) {
      modules.set(url, (async () => {
        const source = await readFile(fileURLToPath(url), 'utf8');
        const module = new SourceTextModule(source, { identifier: url });
        await module.link((specifier) => load(new URL(specifier, url).href));
        return module;
      })());
    }
    return modules.get(url);
  }
  const services = {};
  for (const name of ['listings', 'categories', 'favorites', 'dashboard']) {
    const module = await load(new URL(`../src/services/${name}-service.js`, import.meta.url).href);
    await module.evaluate();
    services[name] = module.namespace;
  }
  return services;
}

const userId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const categoryId = '20000000-0000-4000-8000-000000000001';
const listingId = '30000000-0000-4000-8000-000000000001';
let user = { id: userId };
let authError = null;
let authThrows = false;
const requests = [];
const responses = [];
const mock = {
  auth: { async getUser() {
    if (authThrows) throw new TypeError('Network unavailable');
    return { data: { user }, error: authError };
  } },
  from(table) {
    const steps = [];
    const query = {
      then(resolve, reject) {
        requests.push({ table, steps });
        assert.ok(responses.length, 'Every mock query needs an expected response');
        const response = responses.shift();
        return (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)).then(resolve, reject);
      },
    };
    for (const method of ['select', 'order', 'eq', 'range', 'limit', 'maybeSingle', 'single', 'insert', 'update', 'delete']) {
      query[method] = (...args) => { steps.push([method, ...args]); return query; };
    }
    return query;
  },
};
const { listings, categories, favorites, dashboard } = await loadServices(mock);
const listing = { id: listingId, owner_id: userId, title: 'Desk', category_id: categoryId, price: 12.5 };
const input = { title: ' Desk ', category_id: categoryId, price: '12.50' };
const reply = (data) => responses.push({ data, error: null });
const fail = (code) => responses.push({ data: null, error: { code, message: 'Internal database details' } });
const last = () => requests.at(-1);
const step = (name) => last().steps.find(([method]) => method === name);
const hasFilter = (key, value) => last().steps.some(([method, field, actual]) => method === 'eq' && field === key && actual === value);
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

reply([listing]);
assert.deepEqual(await listings.getListings(), [listing]);
assert.equal(last().table, 'listings');
assert.deepEqual(last().steps.filter(([m]) => m === 'order'), [['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }]]);
assert.deepEqual(step('range'), ['range', 0, 99]);
reply([listing]); assert.deepEqual(await listings.getLatestListings(), [listing]);
assert.deepEqual(step('select'), ['select', '*, category:categories(name)']);
assert.deepEqual(step('limit'), ['limit', 8]);
// Ensure the API row cap does not silently truncate results.
reply(Array.from({ length: 100 }, () => listing)); reply([listing]);
assert.equal((await listings.getListings()).length, 101);
assert.deepEqual(step('range'), ['range', 100, 199]);
reply(listing); assert.deepEqual(await listings.getListingById(listingId), listing);
assert.ok(hasFilter('id', listingId));
reply(null); assert.equal(await listings.getListingById(listingId), null);
reply([listing]); assert.deepEqual(await listings.getMyListings(), [listing]);
assert.ok(hasFilter('owner_id', userId));
assert.equal(feedback.length, 0, 'Successful reads do not notify');

reply(listing);
assert.deepEqual(await listings.createListing({ ...input, owner_id: otherId, id: otherId, created_at: 'bad' }), listing);
assert.deepEqual(step('insert')[1], { title: 'Desk', category_id: categoryId, price: 12.5, owner_id: userId });
assert.deepEqual(feedback.at(-1), { type: 'success', message: 'Listing created successfully.' });
reply(listing);
assert.deepEqual(await listings.updateListing(listingId, { title: ' New title ', owner_id: otherId, updated_at: 'bad' }), listing);
assert.deepEqual(step('update')[1], { title: 'New title' });
assert.ok(hasFilter('id', listingId));
reply({ id: listingId }); assert.deepEqual(await listings.deleteListing(listingId), { id: listingId });
assert.ok(hasFilter('id', listingId));
for (const operation of [() => listings.updateListing(listingId, input), () => listings.deleteListing(listingId)]) {
  reply(null); await rejectsCode(operation(), 'NOT_FOUND_OR_FORBIDDEN');
}
fail('42501'); await rejectsCode(listings.updateListing(listingId, input), '42501');
assert.match(feedback.at(-1).message, /permission/);

const beforeValidation = requests.length;
const feedbackBeforeValidation = feedback.length;
for (const price of ['', ' ', null, true, false, [], {}, NaN, Infinity, -1, '-1', '12abc', '1e2', '0x10', '1.234', 10000000000]) {
  await rejectsCode(listings.createListing({ ...input, price }), 'VALIDATION_ERROR');
}
for (const data of [null, [], {}, { ...input, title: ' ' }, { ...input, category_id: '' }, { ...input, category_id: 'invalid' }, { ...input, description: 5 }]) {
  await rejectsCode(listings.createListing(data), 'VALIDATION_ERROR');
}
await rejectsCode(listings.updateListing(listingId, { owner_id: otherId }), 'VALIDATION_ERROR');
await rejectsCode(listings.getListingById('not-an-id'), 'VALIDATION_ERROR');
assert.equal(requests.length, beforeValidation, 'Invalid input never sends a query');
assert.equal(feedback.length, feedbackBeforeValidation, 'Validation stays inline without toast feedback');
reply(listing); await listings.createListing({ ...input, price: 0 }); assert.equal(step('insert')[1].price, 0);
reply(listing); await listings.updateListing(listingId, { description: '', image_url: null });
assert.deepEqual(step('update')[1], { description: null, image_url: null });
fail('23503'); await assert.rejects(listings.createListing(input), /selected category/);

const category = { id: categoryId, name: 'Home' };
reply([category]); assert.deepEqual(await categories.getCategories(), [category]);
assert.deepEqual(step('order'), ['order', 'name']);
reply(category); assert.deepEqual(await categories.createCategory(' Home '), category);
assert.deepEqual(step('insert')[1], { name: 'Home' });
reply(category); await categories.updateCategory(categoryId, ' Home ');
assert.ok(hasFilter('id', categoryId)); assert.deepEqual(step('update')[1], { name: 'Home' });
reply({ id: categoryId }); assert.deepEqual(await categories.deleteCategory(categoryId), { id: categoryId });
assert.ok(hasFilter('id', categoryId));
for (const operation of [() => categories.createCategory('Home'), () => categories.updateCategory(categoryId, 'Home')]) {
  fail('23505'); await assert.rejects(operation(), /already exists/);
}
for (const operation of [() => categories.createCategory('Home'), () => categories.updateCategory(categoryId, 'Home'), () => categories.deleteCategory(categoryId)]) {
  fail('42501'); await rejectsCode(operation(), '42501');
}
reply(null); await rejectsCode(categories.updateCategory(categoryId, 'Home'), 'NOT_FOUND_OR_FORBIDDEN');
reply(null); await rejectsCode(categories.deleteCategory(categoryId), 'NOT_FOUND_OR_FORBIDDEN');
fail('23503'); await assert.rejects(categories.deleteCategory(categoryId), /still used by listings/);
await rejectsCode(categories.createCategory(' '), 'VALIDATION_ERROR');

reply([{ listing }, { listing: null }]);
assert.deepEqual(await favorites.getFavorites(), [listing]);
assert.equal(last().table, 'favorites'); assert.ok(hasFilter('user_id', userId));
assert.deepEqual(step('select'), ['select', 'listing:listings(*)']);
reply({ id: 'favorite', user_id: userId, listing_id: listingId });
await favorites.addFavorite(listingId);
assert.deepEqual(step('insert')[1], { user_id: userId, listing_id: listingId });
fail('23505'); await assert.rejects(favorites.addFavorite(listingId), /already in your favorites/);
fail('23503'); await assert.rejects(favorites.addFavorite(listingId), /no longer exists/);
reply({ id: 'favorite' }); assert.equal(await favorites.isFavorite(listingId), true);
assert.ok(hasFilter('user_id', userId) && hasFilter('listing_id', listingId));
reply(null); assert.equal(await favorites.isFavorite(listingId), false);
reply({ id: 'favorite' }); assert.equal(await favorites.removeFavorite(listingId), true);
assert.ok(hasFilter('user_id', userId) && hasFilter('listing_id', listingId));
const beforeMissingFavorite = feedback.length;
reply(null); assert.equal(await favorites.removeFavorite(listingId), false);
assert.equal(feedback.length, beforeMissingFavorite, 'Already-absent favorites do not show a removal success');
await rejectsCode(favorites.addFavorite('invalid'), 'VALIDATION_ERROR');

fail('XX000'); await assert.rejects(listings.getListings(), (error) => error.code === 'XX000' && !error.message.includes('Internal database details'));
responses.push(new TypeError('Network unavailable'));
await rejectsCode(categories.getCategories(), 'REQUEST_FAILED');
authThrows = true; await rejectsCode(listings.getMyListings(), 'REQUEST_FAILED'); authThrows = false;
authError = { code: 'refresh_token_not_found' };
await rejectsCode(listings.getMyListings(), 'refresh_token_not_found'); authError = null;

const beforeDashboard = requests.length;
const beforeDashboardFeedback = feedback.length;
responses.push({ count: 1205, error: null }, { count: 2500, error: null });
for (let offset = 0; offset < 1205; offset += 100) {
  reply(Array.from({ length: Math.min(100, 1205 - offset) }, (_, index) => ({
    id: `listing-${offset + index}`, category_id: offset + index === 1204 ? 'last-page-category' : categoryId,
  })));
}
assert.deepEqual(await dashboard.getDashboardStats(), { totalListings: 1205, totalFavorites: 2500, totalCategoriesUsed: 2 });
const dashboardRequests = requests.slice(beforeDashboard);
assert.equal(dashboardRequests.length, 15, 'Two exact counts and every category page');
for (const request of dashboardRequests) {
  assert.ok(request.steps.some(([method, field, value]) => method === 'eq' && field === (request.table === 'favorites' ? 'user_id' : 'owner_id') && value === userId));
}
for (const request of dashboardRequests.slice(0, 2)) {
  assert.deepEqual(request.steps.find(([method]) => method === 'select'), ['select', 'id', { count: 'exact', head: true }]);
}
assert.deepEqual(step('range'), ['range', 1200, 1299]);
responses.push({ count: 0, error: null }, { count: 0, error: null }); reply([]);
assert.deepEqual(await dashboard.getDashboardStats(), { totalListings: 0, totalFavorites: 0, totalCategoriesUsed: 0 });
responses.push({ count: null, error: null }, { count: 0, error: null }); reply([]);
await rejectsCode(dashboard.getDashboardStats(), 'REQUEST_FAILED');
fail('42501'); responses.push({ count: 0, error: null }); reply([]);
await rejectsCode(dashboard.getDashboardStats(), '42501');
assert.equal(feedback.length, beforeDashboardFeedback, 'Dashboard service reads do not publish notifications');

user = null;
const protectedOperations = [
  () => dashboard.getDashboardStats(),
  () => listings.getMyListings(), () => listings.createListing(input),
  () => listings.updateListing(listingId, input), () => listings.deleteListing(listingId),
  () => categories.createCategory('Home'), () => categories.updateCategory(categoryId, 'Home'), () => categories.deleteCategory(categoryId),
  () => favorites.getFavorites(), () => favorites.addFavorite(listingId),
  () => favorites.removeFavorite(listingId), () => favorites.isFavorite(listingId),
];
const beforeAuth = requests.length;
for (const operation of protectedOperations) await rejectsCode(operation(), 'AUTH_REQUIRED');
authError = { name: 'AuthSessionMissingError' };
await rejectsCode(listings.getMyListings(), 'AUTH_REQUIRED'); authError = null;
assert.equal(requests.length, beforeAuth, 'Missing authentication never sends database queries');
// Public operations remain usable without a session.
reply([]); assert.deepEqual(await listings.getListings(), []);
reply([]); assert.deepEqual(await categories.getCategories(), []);
assert.equal(responses.length, 0);
for (const message of ['Listing updated successfully.', 'Listing deleted successfully.', 'Category created successfully.', 'Category updated successfully.', 'Category deleted successfully.', 'Listing added to favorites.', 'Listing removed from favorites.']) {
  assert.ok(feedback.some((event) => event.type === 'success' && event.message === message));
}
assert.ok(feedback.every((event) => !/Internal database details|XX000|23505|42501/.test(event.message)));
delete globalThis.window;
console.log('PASS: mocked services — queries, pagination, authenticated IDs, field allowlists, validation, return values, duplicates, errors, and authentication gates.');

if (process.argv.includes('--live')) {
  const { createClient } = await import('@supabase/supabase-js');
  const { parseEnv } = await import('node:util');
  // Read-only checks: prefer local config, falling back to the public template.
  const envUrl = new URL('../.env.local', import.meta.url);
  const config = parseEnv(await readFile(envUrl, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return readFile(new URL('../.env.example', import.meta.url), 'utf8');
  }));
  const client = createClient(process.env.VITE_SUPABASE_URL || config.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const live = await loadServices(client);
  assert.ok(Array.isArray(await live.listings.getListings()));
  assert.ok(Array.isArray(await live.categories.getCategories()));
  assert.equal(await live.listings.getListingById(listingId), null);
  await rejectsCode(live.listings.getMyListings(), 'AUTH_REQUIRED');
  await rejectsCode(live.favorites.getFavorites(), 'AUTH_REQUIRED');
  console.log('PASS: live anonymous service reads and missing-session gates (read-only; no records created).');
  console.log('NOT RUN: authenticated service calls with real user/admin accounts; no test accounts are available. SQL role tests are separate.');
}
