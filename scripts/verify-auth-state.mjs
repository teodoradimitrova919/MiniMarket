import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { safeReturnUrl, validateEmail, validatePassword, validateUsername } from '../src/utils/auth-validation.js';

globalThis.window = { location: { origin: 'https://minimarket.example' } };
for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/register?returnTo=/admin', 'javascript:alert(1)', '/\n/evil.example']) {
  assert.equal(safeReturnUrl(value), '/dashboard');
}
assert.equal(safeReturnUrl('/favorites?from=home'), '/favorites?from=home');
assert.equal(validateEmail(' alex@example.com '), 'alex@example.com');
assert.equal(validateUsername(' Alex '), 'Alex');
assert.throws(() => validateEmail('invalid'));
assert.throws(() => validatePassword('short', { registration: true }));
assert.throws(() => validateUsername(' '));
delete globalThis.window;

let callback;
let session = null;
let unsubscribeCount = 0;
let profileLoad = async (id) => ({ id, username: 'User', role: 'user' });
const fake = {
  async getSession() { return session; },
  async getCurrentUser() { return session?.user || null; },
  getCurrentProfile(id) { return profileLoad(id); },
  onAuthStateChange(fn) { callback = fn; return () => { unsubscribeCount += 1; }; },
};
const sdk = new SyntheticModule(Object.keys(fake), function () {
  for (const [name, value] of Object.entries(fake)) this.setExport(name, value);
});
await sdk.link(() => {}); await sdk.evaluate();
const source = await readFile(new URL('../src/services/auth-state.js', import.meta.url), 'utf8');
const module = new SourceTextModule(source, { importModuleDynamically: () => sdk });
await module.link(() => {}); await module.evaluate();
const auth = module.namespace.createAuthState();
assert.equal(auth.getState().ready, false);
await auth.initialize();
assert.equal(auth.getState().ready, true);
assert.equal(auth.getState().user, null);

let finishProfile;
profileLoad = () => new Promise((resolve) => { finishProfile = resolve; });
session = { user: { id: 'old-user' } };
callback('SIGNED_IN', session);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(auth.getState().ready, false);
session = null; callback('SIGNED_OUT', null);
assert.equal(auth.getState().user, null);
finishProfile({ id: 'old-user', role: 'admin' });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(auth.getState().user, null, 'Late profile response cannot restore logged-out state');

profileLoad = async (id) => ({ id, role: 'user' });
session = { user: { id: 'new-user', user_metadata: { role: 'admin' } } };
await auth.refresh();
assert.equal(auth.getState().user.id, 'new-user');
assert.equal(auth.getState().profile.role, 'user', 'Role comes from the profile, not user metadata');
const before = auth.getState();
callback('TOKEN_REFRESHED', session);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(auth.getState().ready, true);
assert.equal(auth.getState().user.id, before.user.id);
profileLoad = async () => { throw new Error('Session verification unavailable'); };
await auth.refresh();
assert.equal(auth.getState().ready, true);
assert.equal(auth.getState().user, null, 'Failed verification clears previous user state');
auth.dispose(); assert.equal(unsubscribeCount, 1);
console.log('PASS: auth validation, safe return URLs, initialization, metadata-independent roles, token refresh, stale-response rejection, and subscription cleanup.');
