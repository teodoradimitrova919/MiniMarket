# Authentication

`auth-service.js` uses the existing public Supabase client for email/password registration, login, logout, session reads, verified user reads, profile reads, and auth subscriptions. Supabase manages session persistence, refresh, and browser/tab synchronization. Passwords are never stored by application code or logged.

| Function | Result |
| --- | --- |
| `register(email, password, username)` | Supabase `{ user, session }`; session can be null when confirmation is required |
| `login(email, password)` | Supabase `{ user, session }` |
| `logout()` | Signs out this browser session with `scope: local` |
| `getCurrentUser()` | Auth-server-verified user, or null when there is no session |
| `getSession()` | SDK-managed session or null; not an authorization boundary |
| `onAuthStateChange(callback)` | Unsubscribe function; callback receives event and session |
| `getCurrentProfile(userId)` | Profile read under RLS |

Auth errors have friendly messages and codes; raw request details, tokens, and passwords are never logged. Registration sends only username metadata. The database trigger creates the profile and authoritative `user_roles` assignment as `user`; no frontend role assignment or profile insertion is performed. `getCurrentProfile` combines profile identity/name with the role read under RLS from `user_roles`, never mutable metadata or the legacy profile-role mirror. Every `/admin` subroute is guarded, and server operations independently verify current roles. See [admin authorization](../../supabase/ADMIN.md).

`auth-state.js` keeps a small in-memory view of the verified user/profile. It initializes from the SDK session before protected/auth routes render, reloads identity/profile after auth events, and clears old state on sign-out or failed verification. Revision checks ignore stale profile requests. It schedules async work outside the SDK auth callback, and disposes subscriptions/timers. Same-user token refresh does not remount the current page unnecessarily.

The router unmounts pages on account changes, guards `/dashboard`, `/my-listings`, `/favorites`, `/listings/add`, and `/listings/:id/edit`, and restricts `/admin` to administrators. Visitors go to `/login?returnTo=...`. Valid same-origin return URLs are preserved; external/protocol-relative/backslash/control-character URLs and auth loops are rejected. A successful login or active-session registration goes to the safe return URL or `/dashboard`. Signed-in users opening Login/Register are redirected to that default or their safe return URL. Logout returns Home. Existing RLS remains the security boundary.

## Email confirmation

The available MCP tools cannot write Auth provider settings. The user disabled **Confirm email** in Supabase Dashboard → Authentication → Providers → Email. The public Auth settings endpoint was then checked on 2026-11-08 and reported `mailer_autoconfirm=true` (confirmation disabled). No schema or RLS changes were needed.

If confirmation is re-enabled, registration without a session stays on the form and displays a check-email success message. It never treats a returned user object alone as an authenticated session.

## Verification

```sh
npm test
npm run test:auth
npm run build
```

State tests cover validation, safe return URLs, initialization, profile-based roles, token refresh, stale responses after logout, failed verification, and unsubscribe cleanup.

`scripts/verify-auth-browser.mjs` uses the optional Playwright tool described in the root README. Set `AUTH_TEST_URL` (default `http://127.0.0.1:5180`), `PLAYWRIGHT_MODULE_PATH` when using an external install, and optionally `CHROME_PATH`, then run `node scripts/verify-auth-browser.mjs`.

Browser verification passed for real registration and the trigger-created user profile, valid/invalid login, logout to Home, refresh persistence, visitor/user/admin header links and guards, safe return URLs, Back/Forward, cross-tab logout, expired-session handling, responsive layouts, and confirmation-without-session/duplicate-submit behavior. The last two branches use controlled responses and send no email. Temporary registration accounts were removed through the server-side Auth Admin API; existing demo accounts/passwords were not modified. Server credentials are used only by the Node test cleanup, never sent to the browser.

Listing CRUD forms include an unsaved-change check before explicit logout. The Admin Panel now manages listings/categories/users and listing images; privileged Auth operations remain server-side. Favorites UI and frontend deployment remain deferred.
