# My Listings and listing CRUD

My Listings now opens Add/View/Edit/Delete through [reusable listing modals](../../components/listing-modals/README.md). The direct Add/Edit pages remain functional with the same shared form and guards. Browse also offers public View modals, and direct Details uses the same read-only component. The page-route verification script explicitly navigates to the retained routes; `scripts/verify-listing-modals.mjs` checks the modal UI and cleanup.

`/my-listings` loads the authenticated user's listings through `getMyListings()`, including joined category names, ordered by created_at then ID descending. It displays all returned pages in a responsive Bootstrap table with visually truncated titles, EUR prices, formatted creation dates, and View/Edit/Delete actions. On small screens the focusable table region scrolls horizontally. Loading, empty, and retryable error states remain visible without showing stale rows.

`/listings/add` and `/listings/:id/edit` keep separate HTML/CSS/JS page files and share `components/listing-form/`. The form loads categories and, for editing, the existing listing. Non-owners see an unavailable/permission message before any listing values are populated; verified admins may edit under the existing policy. Invalid/missing IDs are handled without displaying record details.

Required title, price, and category validation appears beside each input and focuses the first invalid field. Description is optional. Payloads contain only these four fields; no owner/image/role input exists. The existing create service derives owner_id from the verified Auth user, and update's allowlist prevents ownership changes. Price validation follows numeric(12,2): non-negative, finite, within range, with at most two decimal places.

While saving, fields/Save/Cancel are disabled and duplicate submissions are ignored. Failed saves retain every entered value and show the existing service's error toast plus a readable inline error. Successful saves use the service's single success toast and return to My Listings without an unsaved warning. Existing image URLs are preserved on edit; uploads are not implemented.

## Deletion

Delete opens a Bootstrap confirmation modal showing the safely rendered title and explaining permanence. Cancel leaves data unchanged. Pending requests disable modal actions and prevent closing/repeated requests. Success closes the modal, restores focus to Add Listing, and reloads the table; errors keep the dialog available to retry. Only `deleteListing()` is called: favorites cascade in the database, never through extra frontend deletion logic. Modal/backdrop/focus listeners are cleaned up on page unmount.

## Unsaved changes and navigation

`utils/unsaved-changes.js` compares field snapshots, attaches a beforeunload listener only while dirty, and exposes `canLeave`, `markClean`, and cleanup. Page cleanup functions may expose `canLeave()`; the shared router checks it before navigation. It assigns indexes to its History API entries so a canceled Back/Forward traversal restores the original entry without remounting/discarding the form. Native fragment-only navigation does not unmount forms.

Cancel and normal links ask before discarding changes. Explicit logout checks the same guard before signing out. Security-driven auth/account changes still clear old pages immediately. A save in progress warns that leaving does not cancel the request. Successful saves mark clean before navigation, and unchanged/reverted forms do not warn. Native refresh/tab-close dialogs are browser-controlled and depend on browser/user-activation support; they cannot be guaranteed for every mobile OS termination scenario.

## Verification

```sh
npm test
npm run test:auth
npm run test:unsaved
npm run build
```

`scripts/verify-listing-crud.mjs` uses the optional independent Playwright tool described in the root README. Set `LISTINGS_TEST_URL` (default `http://127.0.0.1:5180`), `PLAYWRIGHT_MODULE_PATH`, and optionally `CHROME_PATH`, then run the script against the dev server. Server-only `.env.seed.local` is used solely by the Node verification process for temporary fixtures/cleanup; no server key is sent to the browser.

Live verification passed for owned-only tables, category loading, create/edit/delete, spoofed owner input rejection, admin editing with owner preservation, non-owner UI denial and real RLS update/delete denial, field validation, failed-save retention, duplicate create/delete prevention, modal cancel/retry, favorites cascade, missing IDs, loading/empty/error/retry states, desktop/mobile layout, safe title rendering, and newest-first ordering. Native confirmations were tested for links, canceled logout, Back/Forward, refresh, and tab closing; pristine/saved forms did not warn. Temporary accounts/listings/favorites were removed afterward, with existing accounts/passwords and seed records preserved.

No database schema/RLS changes, listing details implementation, favorites management UI, Admin Dashboard, image upload, or deployment is included.
