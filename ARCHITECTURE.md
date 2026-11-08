# MiniMarket architecture plan

## Scope and current phase

MiniMarket is a lightweight marketplace for classified advertisements. The shell, database/RLS, services, and demo seed are complete. The current phase implements Home with live categories, eight recent listings, a reusable listing card, search navigation, How It Works, and account links. Other pages remain placeholders. Authentication, listing management forms, filtering, image uploads, Storage, and deployment remain deferred. See [database design](supabase/README.md), [service contracts](src/services/README.md), and [Home behavior and verification](README.md); database sections below describe the original plan, with the linked document recording final choices.

Core features are browsing and searching listings, account registration and login, creating and managing owned listings, favorites, and administrator management of listings and categories. Carts, payments, messaging, shipping, and bidding are outside scope.

## Application modules

- **Entry point:** `src/main.js` initializes the shared layout and router.
- **Router:** one History API router resolves URLs, passes a shared navigate function to page mounts, and calls cleanup before navigation. Pages remove event listeners and ignore late responses on unmount. Authentication/role guards remain deferred.
- **Pages:** each page has its own JavaScript module and separate CSS and HTML fragments. Fragments contain no `html`, `head`, or `body` elements.
- **Shared components:** header, navigation, footer, listing cards, and reusable status feedback. Substantial components keep HTML, CSS, and JavaScript separate.
- **Services:** implemented listing, category, and favorite services share one Supabase client and isolate backend details from pages. Home reads categories and eight newest listings through these services. Authentication/profile flows and storage operations remain deferred.
- **Utilities:** form validation, price formatting, and safe rendering. Prefer DOM text APIs for user content; never interpolate untrusted values into HTML.
- **Styles:** Bootstrap 5 and Bootstrap Icons, with a small shared stylesheet for consistent colors, typography, spacing, and responsive behavior.

Pages call services rather than Supabase directly. Use simple modules and functions without a framework or unnecessary abstractions. Show loading, empty, success, and error states where appropriate; confirm destructive actions.

## Pages and navigation

| Route | Page | Access |
| --- | --- | --- |
| `/` | Home with advertisements | Public |
| `/login` | Login | Public |
| `/register` | Registration | Public |
| `/listings` | Browse, search, and filter | Public |
| `/listings/add` | Create advertisement | Authenticated |
| `/listings/:id` | Advertisement details | Public |
| `/listings/:id/edit` | Edit advertisement | Owner or administrator |
| `/my-listings` | Manage own advertisements | Authenticated |
| `/favorites` | Saved advertisements | Authenticated |
| `/admin` | Manage advertisements and categories | Administrator |
| Any unmatched URL | Not Found | Public |

Match `/listings/add` before the dynamic listing detail route. Shared navigation exposes browsing, account actions, and relevant protected destinations. Preserve normal link behavior and browser back/forward navigation. Frontend guards improve navigation; database authorization remains authoritative.

## Proposed folder structure

```text
MiniMarket/
|-- AGENTS.md
|-- .github/
|   `-- codex-instructions.md
|-- ARCHITECTURE.md
|-- README.md
|-- public/
|-- src/
|   |-- pages/                 # Separate page modules and HTML fragments
|   |-- components/            # Header, navigation, footer, listing cards
|   |-- services/              # Auth, profiles, listings, categories, favorites, storage
|   |-- utils/                 # Validation, price formatting, safe rendering
|   |-- styles.css             # Shared styles and design tokens
|   |-- router.js              # History API router and route definitions
|   `-- main.js
|-- supabase/
|   `-- migrations/            # Versioned SQL added in the backend phase
|-- index.html
|-- package.json
|-- vite.config.js
|-- netlify.toml
|-- .env.example
`-- .gitignore
```

The shell folders and configuration now exist. Empty service, utility, public, script, and migration folders are reserved using .gitkeep files. All routes currently render public placeholders; the Access column above describes future authorization requirements.

## Planned Supabase integration

Use Supabase Auth for accounts, Postgres for application data, and Storage for listing images. Configure the public Supabase URL and publishable client key through Vite environment variables, documented in a future `.env.example`. Never commit secrets or expose a service-role key in frontend code. Vite client environment values are public.

Plan these relationships without creating tables yet:

- `profiles`: UUID primary key referencing the Auth user; profile information, role (`user` or `admin`), and timestamps.
- `categories`: UUID primary key, category name, and appropriate timestamps; one category has many listings.
- `listings`: UUID primary key; owner foreign key to `profiles`, category foreign key to `categories`, title, description, nonnegative price, image storage reference, and timestamps.
- `favorites`: user and listing foreign keys, a UUID primary key, a creation timestamp, and a unique user/listing pair. This connects profiles and listings through a many-to-many relationship.

Choose explicit deletion behavior in the migration phase: remove related favorites when a listing is deleted; prevent category deletion while listings still reference it or require reassignment first. Keep SQL migrations in `supabase/migrations/` and synchronize them with the repository. Store image paths rather than image binaries in listing records.

## Authentication and authorization

The future auth service exposes registration, login, logout, current session, and session changes. New accounts receive the regular user role. Users must never assign or update their own administrator role; administrator provisioning requires a trusted administrative process.

Enable Row-Level Security as the authorization boundary. Plan policies allowing public reads of advertisements and categories, authenticated creation of listings owned by the caller, owner updates/deletion of listings, and administrator management of all listings and categories. Restrict favorites to their owning user and profile reads/updates to the fields and users that require them. Protect role fields separately from normal profile editing.

Storage policies must enforce ownership and administrator permissions for image upload, replacement, and deletion. Choose public image delivery or signed URLs deliberately during integration. Test policies with visitor, owner, other-user, and administrator sessions; frontend guards alone do not secure data.

## Development and deployment

Implement incrementally with Vanilla JavaScript ES modules, HTML5, CSS3, Vite, Bootstrap 5, and Bootstrap Icons. Add dependencies only when their implementation phase needs them. Develop locally in Visual Studio Code and maintain small, descriptive Git commits in GitHub.

In the deployment phase, configure Netlify to run `npm run build` and publish Vite's `dist` folder. Add an SPA fallback rewrite to `/index.html` so direct links and refreshes resolve through the router. Configure public Supabase variables in Netlify and approved authentication redirect URLs in Supabase. Verify protected routes, unknown routes, and direct navigation before release. Do not deploy in this shell phase.
