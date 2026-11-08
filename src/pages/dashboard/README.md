# User Dashboard

`/dashboard` is an authenticated overview, separate from the existing `/my-listings` and administrator `/admin` pages. It shows the current user's listing count, favorite count, and distinct categories used, plus links to My Listings, Add Listing, My Favorites, and Browse Listings. Existing destination pages remain unchanged.

The shared header shows Dashboard only for authenticated users. Default login/active-session registration and authenticated visits to Login/Register lead here; safe internal return URLs retain priority. Visitors requesting Dashboard are redirected to Login with the original return URL. Logout still goes Home.

## Data and states

`services/dashboard-service.js` verifies the current user through the existing helper. It does not accept a caller-supplied user ID. Listing and favorite totals use `select('id', { count: 'exact', head: true })` with explicit `owner_id`/`user_id` filters. Counts do not come from a page of results. Missing/unverifiable counts are errors, not silently converted to zero.

Distinct categories come from every page of that user's `(id, category_id)` listing rows, ordered by ID. A Set deduplicates category IDs after pagination. This avoids API row-limit truncation without adding a database function, table, or dependency. Existing RLS remains in force; even admins' queries are explicitly filtered to their own ID. These are independent read requests, not a transactional snapshot; reloading the page fetches fresh data.

The page hides previous values while loading or on error, offers a retry, and shows a friendly empty state when listings or favorites are zero. Unexpected load failures use the existing error toast. Successful loads stay quiet. Usernames are rendered as text. Cleanup removes retry listeners, and active-page/user-ID checks prevent late requests from showing another account's data after logout or account changes. No user statistics are cached globally.

## Verification

`npm test` covers exact-count options, explicit ownership filters, zero results, query/count errors, missing authentication, and 1,205 listing rows with a new category only on the final page. `npm run test:auth` checks the new safe default and existing auth state behavior. `npm run build` succeeds.

The optional `scripts/verify-dashboard.mjs` browser check uses the independent Playwright tool described in the root README. Start Vite; optionally set `DASHBOARD_TEST_URL` (default `http://127.0.0.1:5180`), `PLAYWRIGHT_MODULE_PATH`, and `CHROME_PATH`, then run `node scripts/verify-dashboard.mjs`.

Live UI counts were compared with independent read-only SQL counts:

| User | Listings | Favorites | Categories used |
| --- | ---: | ---: | ---: |
| Alex | 8 | 4 | 6 |
| Sofia | 4 | 3 | 4 |
| Gogo | 6 | 5 | 6 |

All three accounts passed, including admin-specific ownership filtering. A temporary, confirmed Auth Admin account verified real zero counts and the empty state; it was deleted afterward, including its trigger-created profile. Existing user accounts/passwords and marketplace records were not changed.

Browser checks also cover visitor protection, default/return-URL login destinations, direct loading/refresh, changed data after reload, navigation/Back/Forward, desktop/tablet/mobile layouts, loading/error/retry, no load-success toasts, and late responses after logout/account switching. Controlled response fixtures exercise failures without altering database data. Screenshots are stored under ignored `node_modules/.dashboard-verification/`.
