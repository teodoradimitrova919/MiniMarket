# MiniMarket demo seed

This server-only seed is pinned to the confirmed MiniMarket project `kkcfqkwkdcqvnurbdxus`. It uses Auth Admin and the existing `profiles`, `user_roles`, `categories`, `listings` and `favorites` tables; it changes no schema or RLS policies. Do not import any seed file into the frontend.

## Local setup

Use the installed Supabase SDK and Node.js version required by this project. Create `.env.seed.local` in the repository root (already ignored by Git):

```dotenv
MINIMARKET_PROJECT_REF=kkcfqkwkdcqvnurbdxus
SUPABASE_URL=https://kkcfqkwkdcqvnurbdxus.supabase.co
SUPABASE_SECRET_KEY=replace_locally_with_your_server_secret_key
```

Get the server secret key from the project's Supabase Settings → API Keys. A legacy service-role JWT can instead be placed in `SUPABASE_SERVICE_ROLE_KEY`. A publishable key cannot perform these operations. Do not add `/rest/v1/` to the URL. Do not use `VITE_` prefixes for privileged values, commit the local file, or paste keys into chat. `.env.example` documents only empty server variable names.

The script checks the configured reference and exact URL against its pinned reference before creating a client. It does not read browser configuration. If using a legacy key, its embedded project reference and service_role claim must also match. Supabase validates the actual credential on the server.

## Commands

```sh
npm run seed -- --dry-run
npm run seed
npm run seed -- --verify-only
npm run seed
```

On Windows PowerShell with execution policy restrictions, use `npm.cmd` instead of `npm`.

The dry run performs read-only Auth Admin and table queries, checks collisions, and reports planned creates versus existing records to skip. It requires a server credential to inspect Auth. It sends no create/update/delete requests. The regular run reports actual created/skipped counts and verifies all fixtures. The final rerun should show zero creates and 3/6/18/12 skips. Run one seed process at a time; concurrent runs are not supported.

The commands can also use server environment variables set by the local shell instead of an env file:

```sh
node scripts/seed.js --dry-run
node scripts/seed.js
node scripts/seed.js --verify-only
```

## Records

| Demo account | Username | Role | Listings | Favorites |
| --- | --- | --- | ---: | ---: |
| test@test.com | Alex | user | 8 | 4 |
| admin@admin.com | Sofia | admin | 4 | 3 |
| gogo@test.com | Gogo | user | 6 | 5 |

New demo accounts use the classroom password `pass123`, as implemented in `seed.js`. These public demo credentials are for fictional classroom accounts, not real users. The script never prints passwords, keys, tokens, or account emails. Accounts are created with the supported Auth Admin `createUser` API and `email_confirm: true`; no signup/invite/confirmation email is sent. It never writes to `auth.users` directly and never resets an existing password.

The existing signup trigger creates profiles and regular authoritative role assignments. Only this seed's accounts, marked with `app_metadata.minimarket_seed = minimarket-demo-v1`, may have their username/role configured by the privileged script. Sofia receives the admin role through a server-side `user_roles` update; the existing role mirror trigger updates `profiles.role`. No client metadata role claim is trusted.

Six categories cover Electronics, Fashion, Home & Garden, Sports, Books, and Toys & Games. Eighteen fictional listings have fixed dates, descriptions, EUR prices, and null image_url values. Twelve favorites reference those listings, with no duplicate pairs. No uploads or frontend changes are included.

## Reruns and existing data

- All three demo email addresses are checked before any write. If an address belongs to an unmarked account, the script refuses to adopt or modify it. Resolve that collision deliberately; do not mark an unrelated account just to bypass the check.
- Categories are reused by their exact existing names without modifying them. Missing categories receive stable seed IDs.
- Listings receive stable UUIDs derived from fixture keys. Existing seed IDs must match the expected content and owner, or execution stops without overwriting that listing. Modified demo listings, including added images, are deliberately not reset.
- Favorites are reused by their unique user/listing pair without modifying existing rows.
- Auth and Data API requests are separate transactions. An interrupted run may leave some seed records created. Fix the reported problem and rerun; already-created matching records are reused. There is no automatic rollback or deletion of unrelated data.
- Counts refer to this seed's fixtures, not the database's total size. A failure prints counts completed so far. Dry-run counts are plans, never actual creations.

## Tests

```sh
npm run test:seed
npm test
npm run build
```

Seed tests use a mock Auth Admin API and in-memory public tables. They verify the project guard, zero-write dry runs, profiles/roles, record ownership, references, category reuse, a zero-write rerun, and refusal to overwrite account/listing collisions. They do not create live records. The real seed verifies confirmed Auth accounts, profiles, all six category names, 18 listing contents/owners, and 12 unique favorite pairs via the existing database constraints.

API reference: [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## Actual execution results

The following is the historical initial run, not a claim that the current database still has untouched fixtures. Later user edits and product-image population changed some demo listings. `--verify-only` and seed reruns deliberately reject changed fixture content, including added covers; they do not reset it. Use the existing dataset normally and inspect any mismatch rather than rerunning to overwrite changes.

Executed and verified against the confirmed MiniMarket project on 2026-11-08. The live dry run made no changes. The first live execution and its verification succeeded:

| Record type | Created | Skipped | Rerun created | Rerun skipped |
| --- | ---: | ---: | ---: | ---: |
| Auth users | 3 | 0 | 0 | 3 |
| Categories | 6 | 0 | 0 | 6 |
| Listings | 18 | 0 | 0 | 18 |
| Favorites | 12 | 0 | 0 | 12 |

All three Auth users are confirmed. Profiles are Alex/user, Sofia/admin, and Gogo/user. Listing ownership is 8/4/6 and favorite ownership is 4/3/5 respectively. Independent read-only MCP checks confirmed the counts, valid references, no duplicate favorite pairs, and null listing images. No schema, RLS, frontend, Storage, or deployment changes were made.
