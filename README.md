# MiniMarket

MiniMarket is a small classifieds marketplace for discovering and advertising second-hand items. Visitors browse public listings; signed-in users publish advertisements, manage their own items and save favorites. Administrators manage marketplace listings, categories and accounts. There is no checkout or purchasing workflow.

Frontend: [minimarketstore.netlify.app](https://minimarketstore.netlify.app). This documentation describes the implemented source and the connected Supabase schema inspected on 9 November 2026. A deployed build can lag behind the current Git branch.

## Capabilities and roles

The database has exactly two application roles: `user` and `admin`. **Member** means a registered, signed-in user; it is not a separate role or subscription. **Owner** means the account referenced by a particular listing's `owner_id`; it is not a global role.

| Audience | Implemented capabilities |
| --- | --- |
| Visitor | View Home/categories/latest listings; search, filter and sort Browse; open listing details; view seller name/email; view images and download attached PDFs; register or log in. Clicking a favorite while signed out leads to Login. |
| User / member | Visitor capabilities plus Dashboard statistics, My Listings, listing creation with images/PDFs, and personal Favorites. The header displays the signed-in profile name. |
| Listing owner | Edit or delete owned advertisements, manage their attachments, and use the owner controls on details. Other users cannot modify those advertisements. |
| Administrator | Overview totals; search/paginate all listings; view/edit/delete listings while preserving ownership; create/edit/delete categories; view/search/create/edit/delete users; choose User/Administrator roles; review deletion impact. In-use categories and removal of the last admin are protected. |

Regular signup always creates a `user` role. Neither signup metadata nor browser code can grant administrator access. The first administrator requires a trusted bootstrap; later role changes use the guarded admin path.

## Technology stack

| Layer | Implementation |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript ES modules |
| UI | Bootstrap `5.3.8`, Bootstrap Icons `1.13.2` |
| Development/build | Vite `8.3.6`, npm lockfile |
| Backend SDK | `@supabase/supabase-js` `2.119.0` |
| Backend | Supabase Postgres, Auth, Storage and Deno Edge Functions |
| Routing/hosting | Browser History API; Netlify SPA rewrite |
| Version control | Git / GitHub |

There is no React/Vue framework, custom Node web server, ORM or application Realtime channel. Node runs development, builds and maintenance/check scripts.

## Architecture and project layout

One `index.html` shell mounts the shared header/footer and one routed page. Page folders contain separate HTML fragments, CSS and JavaScript. Pages call service modules; services share a browser Supabase client. Components reuse listing cards, thumbnails, details, forms, modals, attachment galleries and feedback. Unmount functions dispose listeners/subscriptions and ignore stale asynchronous results. See [ARCHITECTURE.md](ARCHITECTURE.md).

```text
index.html                         Single SPA document
src/main.js                        Shell, Auth state and router initialization
src/router.js                      Routes, access guards, history and cleanup
src/pages/                         Home, auth, dashboard, listing CRUD, favorites, admin
src/components/                    Shared header/footer, cards, details, forms, modals, toasts
src/services/                      Auth, listings, categories, favorites, Storage, admin APIs
src/utils/                         Validation, filters, formatting, upload and leave guards
src/data/populated-image-credits.json  Attribution for added illustrative covers
src/styles.css                     Shared styling
public/                            Static assets
supabase/migrations/               Applied SQL migration history
supabase/functions/                minimarket-admin, listing-attachment-urls, listing-owner
supabase/config.toml               Edge entrypoints and JWT verification settings
scripts/                           Seed, image population, bootstrap and verification tools
package.json / package-lock.json   Commands and pinned dependencies
vite.config.js                     Vite configuration
netlify.toml                       Build command, output directory and SPA fallback
.env.example                       Public and server configuration variable names
```

## Routes

| Routes | Access and behavior |
| --- | --- |
| `/`, `/listings`, `/listings/:id` | Public Home, Browse and canonical details |
| `/login`, `/register` | Account forms; signed-in users redirect to Dashboard or a safe return URL |
| `/dashboard`, `/my-listings`, `/favorites` | Authenticated user |
| `/listings/add` | Authenticated user |
| `/listings/:id/edit` | Authenticated route; record access is limited to owner/admin |
| `/admin`, `/admin/listings`, `/admin/categories`, `/admin/users` | Administrator |
| Unmatched paths | Not Found |

Browse filters titles on every input character, combines category selection and price/newest sorting, and keeps filters in the URL. It filters already loaded rows without another data query or history entry for every letter. Clear filters restores all listings. Shared listing-management modals coexist with the direct Add/Edit/Details routes. Destructive actions require confirmation; dirty forms warn before leaving.

## Local setup

Use Node.js **22.12+** (Node 24 is also supported) and npm. Run from the repository root:

```sh
npm ci
```

Create an ignored `.env.local` using the public configuration below, then start Vite:

```sh
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. If that port is occupied Vite can choose another; Edge Function CORS must allow that origin. On PowerShell with script execution disabled, use `npm.cmd` and `npx.cmd` instead of `npm` and `npx`.

### Public environment variables

```dotenv
VITE_SUPABASE_URL=https://kkcfqkwkdcqvnurbdxus.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_project_publishable_key
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project base URL; no `/rest/v1` path, query or credentials |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public `sb_publishable_...` key accepted by the browser client |

Both values are included in the frontend build. Restart Vite or rebuild after changing them. Missing/invalid configuration produces an application error. Do not put a secret/service-role key in a `VITE_` variable, HTML, source file or Netlify frontend build environment.

For server-only maintenance, `.env.seed.local` uses `MINIMARKET_PROJECT_REF`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`). Edge Functions use platform-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, with optional `MINIMARKET_ADMIN_SECRET_KEY` and `MINIMARKET_ALLOWED_ORIGINS`. These credentials belong only in ignored local files or server secrets. Seed, population and Edge entrypoints are intentionally pinned to this MiniMarket project; moving to another backend also requires reviewing those guards.

## Database and authorization

See [the actual-schema Mermaid ER diagram](supabase/README.md#entity-relationship-diagram). There are six public application tables: `profiles`, `user_roles`, `categories`, `listings`, `favorites`, `listing_attachments`; and three private cleanup-reservation tables: `user_deletions`, `listing_deletions`, `attachment_deletions`. Auth accounts live in Supabase-managed `auth.users`. Owner, favorite-user and uploader foreign keys reference `auth.users` directly, not `profiles`.

### Browser SDK and RLS

`src/services/supabase-client.js` creates one SDK client with the public URL/key. It handles Auth sessions and makes ordinary Data API/Storage requests using the current session JWT. The browser does not query `auth.users` or hold an Auth Admin credential. UI route guards are navigation assistance; database grants, column permissions, RLS policies and integrity triggers enforce authorization.

All six public application tables and all three private cleanup tables have RLS enabled. Listings/categories are publicly readable. Profiles and role assignments are visible to the current user or admins. Users can update their own profile's username, but no self-service profile editor is currently exposed. Favorites are private to the saving user. Listing writes require an active owner/admin; ownership cannot be changed. Category writes require admin. `user_roles` is authoritative; `profiles.role` is a compatibility mirror. Public admin RPCs are invoker wrappers around explicitly authorized private implementations with fixed search paths. Private cleanup state is denied to ordinary clients.

### Images, attachments and private Storage

Two existing buckets serve different delivery needs:

| Bucket | Access | Purpose |
| --- | --- | --- |
| `listing-images` | Public read | Legacy/public listing covers, including populated illustrative product photos |
| `listing-attachments` | Private objects | User-uploaded JPEG/PNG/WebP images and PDF documents |

An owner/admin uploads through existing Storage policies with UUID paths, a 5 MB per-file limit and **five attachments total** per listing (images and PDFs combined). `listing_attachments` stores file metadata; validation derives size/MIME from the real Storage object. Private bucket status prevents unrestricted object access, but attachments on public advertisements are intentionally available to visitors through scoped signed links.

`listing-attachment-urls` accepts attachment IDs, resolves them with anonymous parent-listing RLS, and signs only those stored paths for 300 seconds. It does not accept arbitrary bucket/path input. The client batches thumbnail signing and refreshes expired links. Image priority is the first image attachment (creation time/ID order), then `listings.image_url`, then a placeholder. Shared cards/tables/details use that priority. Images/PDFs and metadata are cleaned through the Storage API before listing/Auth deletion; private reservations make cleanup retryable. See [attachments](supabase/ATTACHMENTS.md).

### Edge Functions and privileged Auth operations

| Deployed function | Boundary |
| --- | --- |
| `minimarket-admin` | JWT verification enabled; handler also verifies the token with Auth and reads current `user_roles`. Admin-only user directory/create/update/delete and role management use server-side Auth Admin APIs. Its `listing.delete` action additionally permits an authorized listing owner for Storage cleanup. |
| `listing-attachment-urls` | JWT gateway verification disabled intentionally for public listing attachments; anonymous RLS selects eligible metadata before server-only signing. |
| `listing-owner` | JWT gateway verification disabled intentionally; an anonymously visible listing determines the owner ID, then the server returns only seller name/email. |

Each function checks its exact origin allowlist. CORS is not an authorization boundary. Public seller email disclosure is intentional in the current design; it is not a public Auth user directory. Admin creation confirms email immediately and does not send an invite; if role promotion fails afterward, the response reports that the account exists and needs a role update. The last admin cannot be removed/demoted, and admin self-deletion is blocked. See [admin operations](supabase/ADMIN.md).

### Synchronization and Realtime

**Supabase Realtime database synchronization is not implemented.** There are no application `.channel()`/`postgres_changes` subscriptions; the inspected database publishes no tables. Do not interpret local `subscribe()` helpers as database Realtime.

The SDK's `onAuthStateChange` synchronizes session changes, including supported same-browser tab behavior. `auth-state.js` re-verifies identity and reloads profile/role after Auth events, with revision checks and unsubscribe cleanup. Favorite buttons share a `minimarket:favorites-changed` DOM event inside the current window; successful CRUD operations reload the affected table. Other users' edits, external role changes and Dashboard counts are not pushed live; refresh or revisit the page to fetch current data. RLS/Edge authorization still checks permissions on requests even if a displayed role is stale.

## Database migration workflow

Versioned SQL lives in `supabase/migrations/`. The five files match the applied `supabase_migrations.schema_migrations` history. These are existing backend migrations, not pending setup work for the hosted project. Do not edit/reapply an applied migration or use history repair to hide a mismatch. Add a new migration for a new schema change.

The examples below use the separately invoked **Supabase CLI 3.0.0**, not an npm dependency or package script. CLI 3 targets local databases by default. Authenticate the CLI with appropriate project access; a local stack also needs Docker and Supabase local services running.

```sh
npm exec --yes --package=supabase@3.0.0 -- supabase migration new descriptive_change
npm exec --yes --package=supabase@3.0.0 -- supabase migration up
npm exec --yes --package=supabase@3.0.0 -- supabase migration list
```

Review the generated SQL, constraints, grants/RLS, Storage behavior and verification results before intentionally applying new changes to a hosted target. To compare the existing remote history or fetch its recorded SQL into local migration files:

```sh
npm exec --yes --package=supabase@3.0.0 -- supabase migration list --remote=kkcfqkwkdcqvnurbdxus
npm exec --yes --package=supabase@3.0.0 -- supabase migration fetch --remote=kkcfqkwkdcqvnurbdxus
```

Fetching history is not schema diffing or applying SQL; review local diffs afterward. An intentional hosted apply uses `supabase migration up --remote=kkcfqkwkdcqvnurbdxus` through the same pinned CLI, followed by remote history and RLS checks. Only run it for reviewed pending changes. The initial admin can be bootstrapped through a trusted SQL connection with [scripts/bootstrap-admin.sql](scripts/bootstrap-admin.sql), targeting an existing Auth user's UUID; signup never promotes an account. Migration details are in [supabase/README.md](supabase/README.md).

## Seed data and demo accounts

The server-only seed targets 3 fictional accounts, 6 categories, 18 listings and 12 favorites. Counts describe seed fixtures, not current database totals. Configure the ignored server environment as described in [scripts/SEED.md](scripts/SEED.md), then use these existing package scripts:

```sh
npm run test:seed
npm run seed -- --dry-run
npm run seed
npm run seed -- --verify-only
```

| Profile | Email | Demo password | Role |
| --- | --- | --- | --- |
| Alex | `test@test.com` | `pass123` | user |
| Sofia | `admin@admin.com` | `pass123` | admin |
| Gogo | `gogo@test.com` | `pass123` | user |

These are classroom demo accounts defined by the seed, not production credentials. The seed confirms new demo emails without sending mail, marks seed-owned accounts, and never resets existing passwords. It skips matching fixtures and refuses collisions/modified listings rather than overwriting them. Existing demo listings now include later edits and populated covers, so a fresh seed/verify-only run against the current hosted dataset may deliberately fail its original-fixture checks. Do not rerun the seed to reset those listings; inspect the failure. Seed role writes use the authoritative `user_roles` table with its profile mirror trigger.

The optional server maintenance script adds reviewed, licensed illustrative covers only where no image exists:

```sh
node --env-file=.env.seed.local scripts/populate-listing-images.js --dry-run
node --env-file=.env.seed.local scripts/populate-listing-images.js --apply
```

It uses the existing public bucket, pinned source hashes, unique paths, a recovery journal and orphan compensation. It does not perform unrestricted web image search or replace user photos. See [source/license report and runbook](scripts/IMAGE_POPULATION.md).

## Verified package commands and checks

All eight npm scripts below exist in `package.json`; no `start`, `deploy`, `lint` or Realtime script is defined.

| Command | Actual action |
| --- | --- |
| `npm run dev` | `vite` development server |
| `npm run build` | `vite build` into `dist/` |
| `npm run preview` | `vite preview` for an existing build |
| `npm test` | `node --experimental-vm-modules scripts/verify-services.mjs` |
| `npm run seed` | `node --env-file=.env.seed.local scripts/seed.js` |
| `npm run test:seed` | `node scripts/verify-seed.mjs` |
| `npm run test:auth` | `node --experimental-vm-modules scripts/verify-auth-state.mjs` |
| `npm run test:unsaved` | `node scripts/verify-unsaved-changes.mjs` |

Typical offline verification:

```sh
npm test
npm run test:auth
npm run test:unsaved
npm run test:seed
npm run build
```

Additional direct Node checks include `node scripts/verify-image-population.mjs` and `node scripts/verify-admin-create-handler.mjs`. Browser/live checks under `scripts/` are separate from npm tests; they require the running app, their documented URL settings and a separately installed Playwright tool (not a project dependency). Set `PLAYWRIGHT_MODULE_PATH` to its `index.mjs` and, where supported, `CHROME_PATH` to Chrome. Some live checks create temporary Auth/listing/Storage fixtures and need server-only cleanup credentials; follow the relevant feature guide instead of running every script against production. The old `verify-database.sql` targets the initial disposable schema only.

## Build and deployment

```sh
npm ci
npm run build
npm run preview
```

`preview` serves `dist/` locally; it is not a deployment command. The repository's `netlify.toml` sets build command `npm run build`, publish directory `dist`, and a `/*` to `/index.html` HTTP 200 rewrite for direct SPA routes and refreshes. For Netlify, connect this repository and the intended deployment branch, configure the two public Vite variables, choose a compatible Node version, and trigger the normal Netlify build. Keep server keys out of the frontend environment.

For a new site origin, configure Supabase Auth's site/allowed redirect URLs and add the exact origin to Edge Function CORS configuration. The function sources already allow `https://minimarketstore.netlify.app`; their default local origins cover localhost/127.0.0.1 on ports 5173/5180. `MINIMARKET_ALLOWED_ORIGINS` supplies additional comma-separated origins and replaces the default local list when set.

The three Edge Functions are already deployed. When intentionally releasing function changes, configure server secrets through Supabase and use the verified CLI command:

```sh
npm exec --yes --package=supabase@3.0.0 -- supabase functions deploy minimarket-admin listing-attachment-urls listing-owner --remote=kkcfqkwkdcqvnurbdxus --use-api --yes
```

Keep the per-function `verify_jwt` settings in `supabase/config.toml`; do not disable JWT checks globally for the admin function. After a release, check direct detail URLs/refresh, login/logout, owner/admin restrictions, signed images/PDF downloads and CORS from the real origin. These are deployment instructions; generating this documentation does not deploy anything.

## Implemented, optional and out of scope

Implemented: public discovery, live local title filtering, categories/sorting/reset, canonical details, seller contacts, Auth, Dashboard, owner CRUD, personal Favorites, shared forms/modals, attachments, consistent thumbnails, admin overview/listings/categories/users/roles, header account name/hover feedback, loading/error/empty states, confirmation/dirty-form guards, and responsive layout.

Optional maintenance/development tools: demo seeding, reviewed product-cover population, standalone browser/live verification, and local Supabase CLI/Docker workflows. Optional future improvements, **not implemented**, include server-side public search/pagination at scale, database Realtime subscriptions, and a self-service profile editor.

Shopping carts, payments, shipping, bidding, messaging, subscriptions and order processing are outside MiniMarket's scope. There are no member tiers, listing statuses, category hierarchies or related database tables.

## Known limitations

- Browse loads the full public listing set before filtering; admin Auth name/email searches scan Auth pages server-side. Both suit the small dataset and need a different approach at scale.
- There is no live database push or offline data synchronization. Signed private-file links expire and require a network request to refresh.
- Public listing details expose seller email and public attachments, including PDFs. A private bucket does not make those advertisement documents owner-only.
- Storage and database/Auth changes are separate operations. Retryable cleanup and partial-success messages are implemented, but a failed multi-step operation may need a retry; there is no cross-service transaction.
- The schema has profile username update permission but no user-facing profile/settings page. Registration follows the project's email-confirmation setting; this source does not provide a complete password-reset flow.
- Demo credentials are public examples. Original seed verification is strict and may reject intentionally edited demo data. Do not use the sample password for real accounts.
- Added stock images are illustrative, not proof of an item's exact model, contents or condition. The dated population report recorded 25 listings, 7 existing photos preserved, 17 covers added and one unidentified `Test ITtem` skipped. The pre-existing bee image on `Wooden Animal Puzzle Set` was preserved and needs owner review.

Further references: [architecture](ARCHITECTURE.md), [database/ER diagram](supabase/README.md), [admin security](supabase/ADMIN.md), [attachments](supabase/ATTACHMENTS.md), [seed](scripts/SEED.md), [image population](scripts/IMAGE_POPULATION.md), and [Auth](src/services/AUTH.md).
