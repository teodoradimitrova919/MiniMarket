# MiniMarket

A lightweight marketplace built manually with Vite, Vanilla JavaScript ES modules, Bootstrap 5, and Bootstrap Icons.

## Run locally

Use Node.js 22.12+ (or a newer supported LTS).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. On Windows PowerShell with script execution disabled, use `npm.cmd` in place of `npm`.

- `npm run build`: build to `dist/`.
- `npm run preview`: serve the production build locally.

## SQL migrations

Database SQL is committed in [`supabase/migrations/`](supabase/migrations/). Open the [initial MiniMarket schema migration](supabase/migrations/20261108082659_initial_minimarket_schema.sql) to see all four tables, foreign keys, constraints, indexes, profile/timestamp triggers, grants, and 13 RLS policies.

This migration is already applied to MiniMarket and matches Supabase's migration history. Subsequent frontend/service work required no additional schema migrations. Do not rerun or edit an applied migration; add a new migration for future database changes. See [database documentation](supabase/README.md).

## Current scope

One HTML shell, shared responsive header/footer, and separate HTML/CSS/JS page folders. Home shows live categories/latest listings; Login/Register use Supabase Auth; Dashboard shows personal statistics. My Listings has Add/View/Edit/Delete modals and an owned-listing table. Add/Edit pages reuse the same validated form with unsaved-change protection. Browse Listings supports public search, category filters, sorting, and View modals; direct details URLs show the same read-only details. Favorites and Admin remain placeholders. Unknown routes render Not Found.

The History API router supports internal navigation, Back/Forward, active links, page titles, focus movement, and mount/unmount cleanup. External links, modified clicks, downloads, and same-page fragments retain browser behavior. Vite handles direct URLs locally; `netlify.toml` supplies the future hosting fallback. No deployment has been performed.

Registration, login, logout, session restoration, and protected routes are implemented. Dashboard, My Listings, Favorites, Add Listing, and Edit Listing require authentication; Admin additionally requires a verified administrator profile. Login/active-session registration default to Dashboard, with safe return URLs taking priority. Listing mutations use existing services and RLS; regular users edit/delete only owned listings, and admins retain existing policy permissions. Favorites/Admin functionality, uploads, Storage integration, and deployment remain deferred.

See [authentication setup and verification](src/services/AUTH.md) for the verified email-confirmation setting, session design, and browser tests. Run `npm run test:auth` for the auth state/validation checks.

Reusable Bootstrap [toast notifications](src/components/toast/README.md) provide success/error/info messages from one shared shell container. Existing mutation services and Home failures supply curated feedback; auth/form errors remain inline and routine reads/login/navigation stay quiet. No new marketplace UI or upload features were added.

## My Listings and listing CRUD

For public discovery, see [Browse Listings behavior and verification](src/pages/listings/README.md): combined title/category filters, URL/history support, and newest/price sorting over all loaded public listings.

See [listing CRUD design and verification](src/pages/my-listings/README.md) and [reusable listing modals](src/components/listing-modals/README.md). The responsive owned-listing table uses joined category names and newest-first ordering. Add New Listing and row actions open Bootstrap modals; successful mutations close and refresh the table. Add/Edit pages remain available and share the same form, failed-save retention, and inline validation. Deletion requires confirmation; related favorites are removed by the database cascade. Unsaved changes warn on modal close, links, Back/Forward, refresh, tab closing, and explicit logout; saved/pristine forms stay quiet. Run `npm run test:unsaved` for guard tests, in addition to `npm test` and `npm run test:auth`. The optional `scripts/verify-listing-modals.mjs` browser check uses temporary fixtures and automatically removes them.

## Dashboard

See [Dashboard design and verification](src/pages/dashboard/README.md). It uses exact counts for personal listings/favorites and paginates category IDs before counting distinct categories. It does not cache previous users' statistics or produce success toasts on load. `npm test` includes count, user-scope, zero-state, and 1,205-listing pagination checks; `scripts/verify-dashboard.mjs` exercises the live UI.

## Environment

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.example` in `.env.local`, then restart Vite to load Home data. Missing configuration or failed requests show section error states while the shell remains usable. Vite client variables are public; never use service-role or secret keys. Keep privileged seed configuration only in `.env.seed.local`. Local environment files are ignored by Git.

## Home page behavior and verification

Search submits through the shared History API router to `/listings?search=...`; category cards link to `/listings?category=<UUID>`. Browse initializes both filters from these links. Home detail links open the details page; Browse cards open a read-only modal with a details-page link. Post an Ad redirects visitors to Login and preserves a safe internal return URL. Categories and recent listings have independent loading, empty, error, and retry states. Page cleanup removes listeners and prevents late responses from rendering after navigation.

Verified with live public Supabase reads, eight-row ordering/limit, search encoding, category/detail/CTA links, Back/Forward, direct loading/refresh, and desktop/tablet/mobile widths (1440, 768, 375, 320px). Controlled browser responses check loading/empty/error/retry, unsafe text/image handling, broken image fallback, and unmount cleanup without modifying database records. Service tests and the production build pass.

`scripts/verify-home.mjs` is an optional browser check using an independently installed Playwright tool (not an application dependency). Start Vite, set `HOME_TEST_URL` to its URL (default `http://127.0.0.1:5180`), optionally set `PLAYWRIGHT_MODULE_PATH` to that tool's `index.mjs` and `CHROME_PATH` to an installed Chrome executable, then run `node scripts/verify-home.mjs`. It expects the six seeded categories and eight latest listings. Screenshots go into ignored `node_modules/.home-verification/`.

## Demo data seed

See [server-side seed setup, dry run, execution, and verification](scripts/SEED.md). It creates three demo Auth users, six categories, eighteen listings, and twelve favorites using a local privileged server credential. Run `npm run test:seed` for the offline safety checks. No privileged configuration belongs in `VITE_` variables.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).

Separate page modules with one `index.html` form a single-page application: JavaScript switches the content while the shell stays mounted. A true Vite multi-page build has multiple HTML entry files and loads a separate document on navigation.
