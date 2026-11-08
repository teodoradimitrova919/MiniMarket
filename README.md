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

## Current scope

One HTML shell, shared responsive header/footer, and separate HTML/CSS/JS page folders. Home at `/` has a search hero, live category shortcuts, eight latest listings, How It Works, and registration/login links. Other canonical routes remain placeholders, including Listings, details, add/edit, account, and admin pages. Unknown routes render Not Found.

The History API router supports internal navigation, Back/Forward, active links, page titles, focus movement, and mount/unmount cleanup. External links, modified clicks, downloads, and same-page fragments retain browser behavior. Vite handles direct URLs locally; `netlify.toml` supplies the future hosting fallback. No deployment has been performed.

Frontend authentication and route guards are deferred; all current routes are public. The Supabase database, RLS policies, shared client, and listings/categories/favorites services are implemented. Home uses a reusable listing card and renders database text safely. Images use placeholders when absent, unsafe, or broken. There are no listing management forms, login/registration flows, Storage integration, or deployment. See [database design and migrations](supabase/README.md) and [service contracts](src/services/README.md). Run `npm test` for controlled service tests.

## Environment

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.example` in `.env.local`, then restart Vite to load Home data. Missing configuration or failed requests show section error states while the shell remains usable. Vite client variables are public; never use service-role or secret keys. Keep privileged seed configuration only in `.env.seed.local`. Local environment files are ignored by Git.

## Home page behavior and verification

Search submits through the shared History API router to `/listings?q=...`; category cards link to `/listings?category=<UUID>`. The Listings page does not filter yet. Detail links, Post an Ad, Register, and Login lead to their existing placeholders. Categories and recent listings have independent loading, empty, error, and retry states. Page cleanup removes listeners and prevents late responses from rendering after navigation.

Verified with live public Supabase reads, eight-row ordering/limit, search encoding, category/detail/CTA links, Back/Forward, direct loading/refresh, and desktop/tablet/mobile widths (1440, 768, 375, 320px). Controlled browser responses check loading/empty/error/retry, unsafe text/image handling, broken image fallback, and unmount cleanup without modifying database records. Service tests and the production build pass.

`scripts/verify-home.mjs` is an optional browser check using an independently installed Playwright tool (not an application dependency). Start Vite, set `HOME_TEST_URL` to its URL (default `http://127.0.0.1:5180`), optionally set `PLAYWRIGHT_MODULE_PATH` to that tool's `index.mjs` and `CHROME_PATH` to an installed Chrome executable, then run `node scripts/verify-home.mjs`. It expects the six seeded categories and eight latest listings. Screenshots go into ignored `node_modules/.home-verification/`.

## Demo data seed

See [server-side seed setup, dry run, execution, and verification](scripts/SEED.md). It creates three demo Auth users, six categories, eighteen listings, and twelve favorites using a local privileged server credential. Run `npm run test:seed` for the offline safety checks. No privileged configuration belongs in `VITE_` variables.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).

Separate page modules with one `index.html` form a single-page application: JavaScript switches the content while the shell stays mounted. A true Vite multi-page build has multiple HTML entry files and loads a separate document on navigation.
