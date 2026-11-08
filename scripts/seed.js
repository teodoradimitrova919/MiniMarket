import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { SEED_NAME, PROJECT_REF, demoUsers, categoryNames, listingFixtures, favoriteKeys } from './seed-data.js';

export function seedId(key) {
  const hex = createHash('sha256').update(`${SEED_NAME}:${key}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function readConfig(env) {
  if (env.MINIMARKET_PROJECT_REF !== PROJECT_REF) {
    throw new Error('Seed refused: MINIMARKET_PROJECT_REF must match the confirmed MiniMarket project.');
  }
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw new Error('Set the server-side SUPABASE_URL.'); }
  if (url.origin !== `https://${PROJECT_REF}.supabase.co` || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Seed refused: SUPABASE_URL must be the confirmed MiniMarket project base URL.');
  }
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  let privileged = key?.startsWith('sb_secret_');
  if (!privileged && key) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      privileged = claims.role === 'service_role' && claims.ref === PROJECT_REF;
    } catch { /* Missing or unsupported key; never include its value in errors. */ }
  }
  if (!privileged) throw new Error('Set SUPABASE_SECRET_KEY or a matching SUPABASE_SERVICE_ROLE_KEY in the local server environment.');
  return { url: url.origin, key };
}

async function request(query, action) {
  try {
    const result = await query;
    if (result.error) throw new Error();
    return result.data;
  } catch {
    // Raw SDK errors can contain request details; log only this fixed context.
    throw new Error(`${action} failed. Check server configuration, permissions, and the existing schema.`);
  }
}

async function authUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const data = await request(client.auth.admin.listUsers({ page, perPage: 100 }), 'Reading Auth users');
    users.push(...data.users);
    if (data.users.length < 100) return users;
  }
}

function findDemoUsers(users) {
  const found = new Map();
  for (const demo of demoUsers) {
    const matches = users.filter((user) => user.email?.toLowerCase() === demo.email);
    if (matches.length > 1 || (matches[0] && matches[0].app_metadata?.minimarket_seed !== SEED_NAME)) {
      throw new Error('Seed refused: a demo email belongs to an unrelated existing account. No account was changed.');
    }
    if (matches[0]) found.set(demo.key, matches[0]);
  }
  return found;
}

function sameListing(existing, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (key === 'created_at') return Date.parse(existing[key]) === Date.parse(value);
    if (key === 'price') return Number(existing[key]) === value;
    return existing[key] === value;
  });
}

function listingData(fixture, users, categories) {
  return {
    id: seedId(`listing:${fixture.key}`), owner_id: users.get(fixture.owner).id,
    category_id: categories.get(fixture.category).id,
    title: fixture.title, description: fixture.description, price: fixture.price,
    image_url: null, created_at: fixture.created_at,
  };
}

export async function verifySeed(client) {
  const users = findDemoUsers(await authUsers(client));
  if (users.size !== 3) throw new Error('Verification failed: expected three seed-owned Auth users.');
  for (const demo of demoUsers) {
    if (!users.get(demo.key).email_confirmed_at) throw new Error('Verification failed: demo email is not confirmed.');
    const profile = await request(client.from('profiles').select('*').eq('id', users.get(demo.key).id).single(), 'Verifying profile');
    if (profile.username !== demo.username || profile.role !== demo.role) throw new Error('Verification failed: demo profile mismatch.');
  }
  const categories = new Map();
  for (const name of categoryNames) {
    categories.set(name, await request(client.from('categories').select('*').eq('name', name).single(), 'Verifying category'));
  }
  const owners = { alex: 0, sofia: 0, gogo: 0 };
  for (const fixture of listingFixtures) {
    const expected = listingData(fixture, users, categories);
    const row = await request(client.from('listings').select('*').eq('id', expected.id).single(), 'Verifying listing');
    if (!sameListing(row, expected)) throw new Error('Verification failed: seed listing mismatch.');
    owners[fixture.owner] += 1;
  }
  let favorites = 0;
  for (const [owner, keys] of Object.entries(favoriteKeys)) {
    for (const key of keys) {
      await request(client.from('favorites').select('id').eq('user_id', users.get(owner).id)
        .eq('listing_id', seedId(`listing:${key}`)).single(), 'Verifying favorite');
      favorites += 1;
    }
  }
  return { users: users.size, categories: categories.size, listings: listingFixtures.length, owners, favorites };
}

export async function seed(client, { dryRun = false } = {}) {
  const counts = Object.fromEntries(['users', 'categories', 'listings', 'favorites'].map((table) => [table, { created: 0, skipped: 0 }]));
  try {
    // Check all demo emails before the first write. Never adopt an unmarked account.
    const users = findDemoUsers(await authUsers(client));
    const categories = new Map();
    // Read/preflight all categories before creating accounts.
    for (const name of categoryNames) {
      const row = await request(client.from('categories').select('*').eq('name', name).maybeSingle(), 'Reading category');
      const id = seedId(`category:${name}`);
      if (!row) {
        const collision = await request(client.from('categories').select('id').eq('id', id).maybeSingle(), 'Checking category ID');
        if (collision) throw new Error('Seed refused: a category seed ID is occupied by unrelated data.');
      }
      categories.set(name, row || { id, name });
    }
    const plannedUsers = new Map(demoUsers.map((demo) => [demo.key, users.get(demo.key) || { id: seedId(`planned-user:${demo.key}`) }]));
    const existingListings = new Map();
    for (const fixture of listingFixtures) {
      const expected = listingData(fixture, plannedUsers, categories);
      const row = await request(client.from('listings').select('*').eq('id', expected.id).maybeSingle(), 'Reading listing');
      if (row && !sameListing(row, expected)) throw new Error('Seed refused: an existing seed listing differs from the fixture. No listing was overwritten.');
      existingListings.set(fixture.key, row);
    }

    for (const demo of demoUsers) {
      if (users.has(demo.key)) counts.users.skipped += 1;
      else {
        if (dryRun) users.set(demo.key, plannedUsers.get(demo.key));
        else {
          // Admin API creates already-confirmed users without signup/invite emails.
          const result = await request(client.auth.admin.createUser({
            email: demo.email, password: 'pass123', email_confirm: true,
            user_metadata: { username: demo.username },
            app_metadata: { minimarket_seed: SEED_NAME },
          }), 'Creating demo Auth user');
          users.set(demo.key, result.user);
        }
        counts.users.created += 1;
      }
      if (!dryRun) {
        const id = users.get(demo.key).id;
        const profile = await request(client.from('profiles').select('*').eq('id', id).single(), 'Reading demo profile');
        if (profile.username !== demo.username || profile.role !== demo.role) {
          // Only seed-marked accounts reach here. No client-controlled role claim.
          await request(client.from('profiles').update({ username: demo.username, role: demo.role })
            .eq('id', id).select('id').single(), 'Configuring demo profile');
        }
      }
    }

    for (const name of categoryNames) {
      const row = await request(client.from('categories').select('*').eq('name', name).maybeSingle(), 'Reading category');
      if (row) { categories.set(name, row); counts.categories.skipped += 1; }
      else {
        if (!dryRun) categories.set(name, await request(client.from('categories').insert(categories.get(name)).select('*').single(), 'Creating category'));
        counts.categories.created += 1;
      }
    }
    for (const fixture of listingFixtures) {
      if (existingListings.get(fixture.key)) counts.listings.skipped += 1;
      else {
        if (!dryRun) await request(client.from('listings').insert(listingData(fixture, users, categories)).select('id').single(), 'Creating sample listing');
        counts.listings.created += 1;
      }
    }
    for (const [owner, keys] of Object.entries(favoriteKeys)) {
      for (const key of keys) {
        const data = { user_id: users.get(owner).id, listing_id: seedId(`listing:${key}`) };
        const row = await request(client.from('favorites').select('id').eq('user_id', data.user_id)
          .eq('listing_id', data.listing_id).maybeSingle(), 'Reading favorite');
        if (row) counts.favorites.skipped += 1;
        else {
          if (!dryRun) await request(client.from('favorites').insert({ id: seedId(`favorite:${owner}:${key}`), ...data }).select('id').single(), 'Creating favorite');
          counts.favorites.created += 1;
        }
      }
    }
    return { dryRun, counts, verification: dryRun ? null : await verifySeed(client) };
  } catch (error) {
    error.counts = counts;
    error.dryRun = dryRun;
    throw error;
  }
}

async function main() {
  if (process.argv.slice(2).some((argument) => !['--dry-run', '--verify-only'].includes(argument))) {
    throw new Error('Usage: node --env-file=.env.seed.local scripts/seed.js [--dry-run | --verify-only]');
  }
  if (process.argv.includes('--dry-run') && process.argv.includes('--verify-only')) throw new Error('Choose dry-run or verify-only, not both.');
  const { url, key } = readConfig(process.env);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  if (process.argv.includes('--verify-only')) {
    console.log('Verified demo record counts:', await verifySeed(client));
    return;
  }
  const result = await seed(client, { dryRun: process.argv.includes('--dry-run') });
  console.log(result.dryRun ? 'DRY RUN: planned creates and existing records to skip; no changes made.' : 'Actual seed results:');
  console.table(result.counts);
  console.log('Demo profile targets: Alex=user; Sofia=admin; Gogo=user. Only seed-owned profiles may be configured.');
  if (result.verification) console.log('Verified demo record counts:', result.verification);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    if (error.counts) {
      console.log(error.dryRun ? 'Dry-run plan before failure (no changes made):' : 'Actual completed operations before failure:');
      console.table(error.counts);
    }
    process.exitCode = 1;
  });
}
