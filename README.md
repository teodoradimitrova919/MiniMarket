# MiniMarket

A lightweight marketplace shell built manually with Vite, Vanilla JavaScript ES modules, Bootstrap 5, and Bootstrap Icons.

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

One HTML shell, shared responsive header/footer, and separate HTML/CSS/JS page folders. All canonical routes in [.github/codex-instructions.md](.github/codex-instructions.md) render placeholders, including listing details, add/edit, and admin. Unknown routes render Not Found. Listing details can be previewed at `/listings/demo` and editing at `/listings/demo/edit`.

The History API router supports internal navigation, Back/Forward, active links, page titles, focus movement, and mount/unmount cleanup. External links, modified clicks, downloads, and same-page fragments retain browser behavior. Vite handles direct URLs locally; `netlify.toml` supplies the future hosting fallback. No deployment has been performed.

Frontend authentication and route guards are deferred; placeholder routes are public. The Supabase database, RLS policies, shared client, and listings/categories/favorites services are implemented. There are no forms, advertisement cards, login/registration flows, Storage integration, or deployment. See [database design and migrations](supabase/README.md) and [service contracts and verification limitations](src/services/README.md). Run `npm test` for controlled service tests.

## Environment

Copy `.env.example` to `.env.local` before using the Supabase client, then restart Vite. The placeholder shell does not import the client and does not require environment values. Client configuration uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Vite client variables are public; never use service-role or secret keys. Local environment files are ignored by Git.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).

Separate page modules with one `index.html` form a single-page application: JavaScript switches the content while the shell stays mounted. A true Vite multi-page build has multiple HTML entry files and loads a separate document on navigation.
