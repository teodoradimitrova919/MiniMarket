import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const source = await readFile(new URL('../src/services/supabase-client.js', import.meta.url), 'utf8');
const valid = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

async function load(env) {
  let calls = 0;
  const client = {};
  const sdk = new SyntheticModule(['createClient'], function () {
    this.setExport('createClient', (url, key) => {
      assert.equal(url, valid.VITE_SUPABASE_URL);
      assert.equal(key, valid.VITE_SUPABASE_PUBLISHABLE_KEY);
      calls += 1;
      return client;
    });
  });
  const module = new SourceTextModule(source, {
    initializeImportMeta(meta) { meta.env = env; },
  });
  await module.link((specifier) => {
    assert.equal(specifier, '@supabase/supabase-js');
    return sdk;
  });
  await module.evaluate();
  return { module, client, calls };
}

await assert.rejects(load({}), /set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/);
await assert.rejects(load({ ...valid, VITE_SUPABASE_URL: '' }), /set VITE_SUPABASE_URL/);
await assert.rejects(load({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: '' }), /set VITE_SUPABASE_URL/);
for (const key of ['sb_secret_test', 'service_role', 'eyJlegacyJWT']) {
  await assert.rejects(load({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }), /publishable key/);
}
for (const url of ['invalid', 'https://example.supabase.co/rest/v1/', 'javascript:alert(1)', 'https://example.supabase.co?key=bad']) {
  await assert.rejects(load({ ...valid, VITE_SUPABASE_URL: url }), /base URL/);
}
const { module, client, calls } = await load(valid);
assert.equal(calls, 1);
assert.equal(module.namespace.supabase, client);
assert.equal(module.namespace.supabase, module.namespace.supabase);
console.log('PASS: missing configuration, unsafe keys, invalid URLs, and one exported client instance.');
