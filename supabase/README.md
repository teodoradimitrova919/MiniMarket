# MiniMarket database

The scoped MCP project is `kkcfqkwkdcqvnurbdxus`, matching the repository's MiniMarket URL and prior confirmed connection. Initial inspection found no public tables, migration history, or Auth users. No other project was accessed.

## Migration history

The SQL files live in the committed [`migrations/` directory](migrations/):

| Version | SQL file | Contents |
| --- | --- | --- |
| `20261108082659` | [initial_minimarket_schema.sql](migrations/20261108082659_initial_minimarket_schema.sql) | Four tables, UUID/FK constraints, indexes, signup and updated_at triggers, grants, and 13 RLS policies |
| `20261108163728` | [admin_roles_panel.sql](migrations/20261108163728_admin_roles_panel.sql) | Authoritative roles, backfill/defaults, safe cleanup reservations, Storage, RPCs, and ownership/image guards |
| `20261108164837` | [admin_rpc_hardening.sql](migrations/20261108164837_admin_rpc_hardening.sql) | Private elevated implementations, public invoker wrappers, and explicit cleanup-state denial |

All three migrations were applied through the confirmed scoped MCP. Local filenames use the versions assigned by the remote migration runner and match hosted history. Do not reapply or edit applied migrations. See [Admin roles, Storage, Edge Functions, bootstrap, and cleanup](ADMIN.md) for the current authorization design and live verification; the original-schema notes below describe the initial foundation.

## Tables and permissions

| Table | Read | Write |
| --- | --- | --- |
| profiles | Own profile; admins can read all | Users may update only their own username |
| categories | Public | Admins only |
| listings | Public | Owner or admin; regular users can only create for themselves |
| favorites | Own favorites only | Own insert/delete only; no update |
| user_roles | Own assignment; admins may read all | Trusted trigger/SQL or authorized admin role RPC; no direct client writes |

All five public tables use UUID primary keys, non-null creation timestamps, and RLS. Listing prices use `numeric(12,2)` (up to 9,999,999,999.99), allow zero, and reject negative values and NaN. Categories have unique, non-blank names. Usernames and listing titles cannot be blank. Usernames are not unique.

Deleting an Auth user cascades to their profile, listings, and favorites. Deleting a listing cascades to its favorites. Categories with listings cannot be deleted until those listings are removed or reassigned. The `(user_id, listing_id)` unique constraint prevents duplicate favorites and indexes the user lookup; separate indexes cover the other foreign keys.

The signup trigger creates a regular profile using a trimmed metadata username, or `user_` plus the user's UUID when absent/blank. Metadata roles are ignored. Clients have no profile INSERT/DELETE permission and only column-level UPDATE permission on username, so they cannot assign roles or change profile IDs. Admin provisioning is a trusted database administrator operation, outside the frontend; no admin account was created.

Private, fixed-search-path functions implement the Auth trigger, administrator lookup, listing integrity, cleanup reservations, and automatic listing `updated_at`. Public admin RPCs are invoker wrappers around explicitly authorized private implementations. Trigger functions are not directly executable by client roles. Keep `private` outside exposed Data API schemas. The administrator helper now reads authoritative `user_roles`; the legacy profile role is mirrored for compatibility and metadata never authorizes access.

## Verification

`scripts/verify-database.sql` is historical verification for an empty disposable database at the initial migration only. It uses transaction-scoped fixtures and ends with ROLLBACK. Do not run it against the populated/current project or after the admin migrations. Current live verification uses `scripts/verify-admin.mjs` and the application browser suites, with supported Auth Admin fixture creation, production RLS/API checks, and marked fixture cleanup; see [current verification instructions](ADMIN.md#verification-and-current-limits).

Initial verification passed. All four public tables and Auth users remained empty afterward. Security and performance advisors reported no findings. Direct anonymous Data API requests with the publishable key also confirmed categories/listings are readable and profiles/favorites are denied. These checks test the authorization boundary; they do not implement or test an end-user login flow.

The frontend client is exported from `src/services/supabase-client.js` and used by application services. Configure the public URL/key from `.env.example` in `.env.local`, then restart Vite. Only a project base URL and `sb_publishable_` key are accepted; configuration errors never echo key values. Keep server-only seed/Edge configuration in their separate ignored local files.

Run client configuration checks with:

```sh
node --experimental-vm-modules scripts/verify-supabase-client.mjs
npm run build
```

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Auth profile triggers](https://supabase.com/docs/guides/auth/managing-user-data).
