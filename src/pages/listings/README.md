# Browse Listings

`/listings` is public. The existing listings service paginates through all public rows, joins category names, and orders newest first. Categories load through the existing categories service. Neither query requests profile information.

The page holds data only for its mount lifetime. Case-insensitive title search filters on every input character; Search/Enter remains available. Category selection and sorting run locally across the full result set. Search and category filters combine. Live typing replaces the current query history entry, preserves spaces/caret/focus and does not add an entry for each letter. No new data requests run when filters, sorting, or same-page browser history change. A reload or leaving and returning to Browse fetches fresh data. This deliberately simple approach suits the small marketplace; a larger dataset can later move filtering and pagination to the server.

URL parameters:

- `search=laptop` (legacy `q` links also work).
- `category=electronics` or an existing category UUID. Readable values use lowercase names separated by hyphens, e.g. `home-garden`.
- `sort=price-asc` or `sort=price-desc`. Omitted/unknown sorting uses newest first, with stable ID tie-breaking.

Unknown categories produce no matches and can be cleared. Filter submissions retain unrelated query parameters; Clear filters resets to `/listings`. The router calls the page's optional `cleanup.updateLocation()` on query-only navigation, synchronizing controls/results without remounting. Normal navigation and auth-state changes still clean up listeners and image callbacks; late reads cannot render or notify after unmount.

The Clear filters button is always available, including for unsent search text. It restores an empty search, All Categories, and Newest First. Clearing only the search input applies the empty search while keeping category/sort. The shared `utils/filter-reset.js` helper also powers Home and the three admin lists; admin resets return to page one. `scripts/verify-filter-resets.mjs` performs read-only live browser checks across all these views using the existing separate Playwright setup.

Cards reuse the Home component with a Browse-only description excerpt and visible View Details affordance. Dynamic text uses `textContent`, titles/descriptions are clamped, prices use the EUR formatter, and unsafe/broken image URLs retain placeholders. Card clicks navigate to the canonical `/listings/:id` page, providing a shareable ID in the URL and direct refresh support. Browser Back restores Browse filters through the History API. Modified clicks retain native browser behavior. Listing-management tables still use the [shared listing modals](../../components/listing-modals/README.md).

Loading, no data, no matches, and retryable errors have inline states. Unexpected read errors also use the existing error toast. Retry retains successful reads and requests only missing data; no load/search success toasts are shown.

## Verification

Start Vite. With a separately installed Playwright tool, set `PLAYWRIGHT_MODULE_PATH` to its `index.mjs` and optionally `CHROME_PATH` to an installed Chrome executable, then run `node scripts/verify-browse.mjs`. `BROWSE_TEST_URL` defaults to `http://127.0.0.1:5180`. No application dependencies are added. Screenshots are stored under ignored `node_modules/.browse-verification/`.

The check uses live public reads to verify all seeded owners, category joins, search, combined filters, price sorts, Home links, detail navigation, direct URLs/refresh, Back/Forward, and no filter refetches. It checks 1440/1024/768/375/320px layouts and controlled responses for loading, empty/error/retry, safe text/images, and unmount cleanup. It also signs in with the existing Alex demo account to check public browsing and the existing dirty-form leave guard, then logs out. It does not create or modify database records. `npm test` also verifies service pagination beyond one API page. Run `npm run build` for the production build.
