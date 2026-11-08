# Favorites

`/favorites` is an authenticated page using the existing favorites/listings tables and RLS. It shows joined categories, EUR prices, description excerpts, and batched signed attachment thumbnails in newest-saved-first order. Missing joined listings are omitted. No schema or authentication changes are required.

The reusable `favorite-controls.js` controller loads the current user's saved IDs once per mounted view instead of querying each card. Browse cards, shared details (including modals), and Favorites reuse it. Buttons expose accessible labels and pressed/busy state, disable during mutations, and update only after success. Services provide existing toast feedback. A scoped change event synchronizes a modal with its underlying card and removes Favorites cards immediately. Removing a card moves keyboard focus to the next heart or the empty-state Browse link.

Anonymous hearts navigate to Login with an internal return path; the router enforces Favorites access. All data operations derive the user from Auth and explicitly filter by that user in addition to RLS. The existing unique constraint rejects duplicates. State belongs to the mounted view, clears on account change, and is discarded on unmount. Controllers remove listeners/subscriptions and ignore stale responses. Dashboard uses its existing exact count query when remounted, including browser history navigation.

Loading, empty, error/retry and failed-mutation states retain clear feedback. Responsive Bootstrap columns show four cards on wide desktops, three on smaller desktops, two on tablets and one on phones. Uploads and admin operations are unchanged.

## Verification

Run `npm test`, `npm run test:auth`, `npm run test:unsaved`, and `npm run build`.

For live verification, start Vite on `http://127.0.0.1:5180`, set `PLAYWRIGHT_MODULE_PATH` to a separately installed Playwright `index.mjs`, set `CHROME_PATH` to Chrome, and run `node scripts/verify-favorites.mjs`. It reads ignored `.env.seed.local` and `.env.local`, creates marked temporary accounts/listings, and cleans them in `finally`. It also temporarily saves an existing public photo listing to a temporary account to check signed thumbnail rendering. Existing accounts/listings are not edited.

Checks cover route protection and safe login returns, owner-scoped RLS and spoofing denials, database uniqueness, rapid submissions, failed mutation retention, browse/details/modal heart synchronization, Favorites removal/empty state, real image/category/price/excerpt cards, most-recent ordering, dashboard counts, refresh/Back/Forward, deleted listings, errors/retry, account switching, and desktop/tablet/mobile layout. Screenshots are stored under ignored `node_modules/.favorites-verification/`. No Netlify deployment is included.
