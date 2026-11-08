import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readConfig, seed, seedId, verifySeed } from './seed.js';
import { PROJECT_REF, SEED_NAME, demoUsers } from './seed-data.js';

const config = {
  MINIMARKET_PROJECT_REF: PROJECT_REF,
  SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  SUPABASE_SECRET_KEY: 'sb_secret_mock_only',
};
assert.equal(readConfig(config).url, config.SUPABASE_URL);
for (const env of [
  {}, { ...config, MINIMARKET_PROJECT_REF: 'other' },
  { ...config, SUPABASE_URL: 'https://other.supabase.co' },
  { ...config, SUPABASE_URL: config.SUPABASE_URL + '/rest/v1/' },
  { ...config, SUPABASE_SECRET_KEY: '', VITE_SUPABASE_SERVICE_ROLE_KEY: 'ignored' },
  { ...config, SUPABASE_SECRET_KEY: 'sb_publishable_mock_only' },
]) assert.throws(() => readConfig(env));
assert.equal(seedId('same'), seedId('same'));
assert.notEqual(seedId('same'), seedId('different'));

function mockDatabase() {
  const users = [];
  const tables = { profiles: [], categories: [], listings: [], favorites: [] };
  const adminCreates = [];
  let writes = 0;
  const client = {
    auth: { admin: {
      async listUsers({ page, perPage }) {
        return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
      },
      async createUser(attributes) {
        assert.equal(attributes.email_confirm, true, 'No confirmation email flow');
        assert.equal(attributes.app_metadata.minimarket_seed, SEED_NAME);
        assert.equal(attributes.password.length, 7, 'Expected classroom demo password');
        adminCreates.push(attributes);
        writes += 1;
        const user = { id: randomUUID(), email: attributes.email, app_metadata: attributes.app_metadata, email_confirmed_at: new Date().toISOString() };
        users.push(user);
        // Simulate the existing Auth trigger, not a direct write by the script.
        tables.profiles.push({ id: user.id, username: attributes.user_metadata.username, role: 'user' });
        return { data: { user }, error: null };
      },
    } },
    from(table) {
      assert.ok(Object.hasOwn(tables, table), 'Seed uses only the four public tables');
      const filters = [];
      let operation = 'select';
      let payload;
      let single = false;
      let required = false;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        insert(data) { operation = 'insert'; payload = data; return query; },
        update(data) { operation = 'update'; payload = data; return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; required = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            let rows = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
            if (operation === 'insert') {
              writes += 1;
              const data = { id: randomUUID(), ...payload };
              assert.ok(!tables[table].some((row) => row.id === data.id), 'No duplicate IDs');
              if (table === 'categories') assert.ok(!tables.categories.some((row) => row.name === data.name));
              if (table === 'listings') {
                assert.ok(users.some((user) => user.id === data.owner_id));
                assert.ok(tables.categories.some((row) => row.id === data.category_id));
              }
              if (table === 'favorites') {
                assert.ok(users.some((user) => user.id === data.user_id));
                assert.ok(tables.listings.some((row) => row.id === data.listing_id));
                assert.ok(!tables.favorites.some((row) => row.user_id === data.user_id && row.listing_id === data.listing_id));
              }
              tables[table].push(data); rows = [data];
            } else if (operation === 'update') {
              writes += 1;
              assert.equal(table, 'profiles', 'Existing rows may only be updated for seed-owned profiles');
              rows.forEach((row) => Object.assign(row, payload));
            }
            if ((required && rows.length !== 1) || (single && rows.length > 1)) return { data: null, error: { code: 'PGRST116' } };
            return { data: single ? rows[0] || null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client, users, tables, adminCreates, writes: () => writes };
}

const db = mockDatabase();
const plan = await seed(db.client, { dryRun: true });
assert.deepEqual(plan.counts, {
  users: { created: 3, skipped: 0 }, categories: { created: 6, skipped: 0 },
  listings: { created: 18, skipped: 0 }, favorites: { created: 12, skipped: 0 },
});
assert.equal(db.writes(), 0, 'Dry-run makes no mutations');
const first = await seed(db.client);
assert.deepEqual(first.counts, plan.counts);
assert.deepEqual(first.verification, { users: 3, categories: 6, listings: 18, owners: { alex: 8, sofia: 4, gogo: 6 }, favorites: 12 });
assert.equal(db.adminCreates.length, 3, 'Users are created through Auth Admin');
assert.equal(db.tables.profiles.find((p) => p.username === 'Sofia').role, 'admin');
const beforeRerun = db.writes();
const second = await seed(db.client);
assert.deepEqual(second.counts, {
  users: { created: 0, skipped: 3 }, categories: { created: 0, skipped: 6 },
  listings: { created: 0, skipped: 18 }, favorites: { created: 0, skipped: 12 },
});
assert.equal(db.writes(), beforeRerun, 'Unchanged rerun does not write, reset passwords, or update accounts');
await verifySeed(db.client);

// An unrelated category is reused by name and its ID is left untouched.
const reuse = mockDatabase();
const category = { id: randomUUID(), name: 'Electronics' };
reuse.tables.categories.push(category);
const reused = await seed(reuse.client);
assert.deepEqual(reused.counts.categories, { created: 5, skipped: 1 });
assert.equal(reuse.tables.categories.find((row) => row.name === 'Electronics').id, category.id);

const conflict = mockDatabase();
conflict.users.push({ id: randomUUID(), email: demoUsers[1].email, app_metadata: {} });
await assert.rejects(seed(conflict.client), /unrelated existing account/);
assert.equal(conflict.writes(), 0, 'All demo emails are preflighted before any write');

const oldListing = db.tables.listings[0];
oldListing.title = 'Edited by someone';
const beforeConflict = db.writes();
await assert.rejects(seed(db.client), /No listing was overwritten/);
assert.equal(db.writes(), beforeConflict);
assert.equal(oldListing.title, 'Edited by someone');
console.log('PASS: seed project guard, dry-run, Auth Admin creation, roles, ownership, FK consistency, safe category reuse, reruns, and collision refusal (mocked; no live changes).');
