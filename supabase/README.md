# MiniMarket database

The scoped MCP project is `kkcfqkwkdcqvnurbdxus`, matching the repository's MiniMarket URL and prior confirmed connection. Initial inspection found no public tables, migration history, or Auth users. No other project was accessed.

## Migration history

`migrations/20261108082659_initial_minimarket_schema.sql` was applied through MCP as `initial_minimarket_schema`. The local filename uses the version assigned by the remote migration runner; its SQL was compared with the recorded remote statements and matches exactly. Do not reapply this migration to the existing project or edit it after application. Add a new migration for future changes.

## Tables and permissions

| Table | Read | Write |
| --- | --- | --- |
| profiles | Own profile; admins can read all | Users may update only their own username |
| categories | Public | Admins only |
| listings | Public | Owner or admin; regular users can only create for themselves |
| favorites | Own favorites only | Own insert/delete only; no update |

All four tables use UUID primary keys, non-null creation timestamps, and RLS. Listing prices use `numeric(12,2)` (up to 9,999,999,999.99), allow zero, and reject negative values and NaN. Categories have unique, non-blank names. Usernames and listing titles cannot be blank. Usernames are not unique in this initial design.

Deleting an Auth user cascades to their profile, listings, and favorites. Deleting a listing cascades to its favorites. Categories with listings cannot be deleted until those listings are removed or reassigned. The `(user_id, listing_id)` unique constraint prevents duplicate favorites and indexes the user lookup; separate indexes cover the other foreign keys.

The signup trigger creates a regular profile using a trimmed metadata username, or `user_` plus the user's UUID when absent/blank. Metadata roles are ignored. Clients have no profile INSERT/DELETE permission and only column-level UPDATE permission on username, so they cannot assign roles or change profile IDs. Admin provisioning is a trusted database administrator operation, outside the frontend; no admin account was created.

Private, fixed-search-path functions implement the Auth trigger, administrator lookup, and automatic listing `updated_at`. Only the caller-bound administrator helper is executable by authenticated users. Trigger functions are not directly executable by client roles. Keep the `private` schema out of exposed Data API schemas. The administrator helper uses trusted profile data rather than mutable JWT user metadata.

## Verification

`scripts/verify-database.sql` runs through the scoped MCP SQL tool as postgres. It switches to `anon` and `authenticated` with fixture JWT claims, exercising visitor, owner, another user, and administrator permissions. Fixtures exist only inside a transaction that ends with ROLLBACK; it is not a seed script. Run the complete file in a single call, never isolated statements. It also checks signup behavior, role escalation, constraints, timestamps, and cascades.

Initial verification passed. All four public tables and Auth users remained empty afterward. Security and performance advisors reported no findings. Direct anonymous Data API requests with the publishable key also confirmed categories/listings are readable and profiles/favorites are denied. These checks test the authorization boundary; they do not implement or test an end-user login flow.

The frontend client is exported from `src/services/supabase-client.js`. Copy `.env.example` to `.env.local`, then restart Vite before importing the module from future services. Only a project base URL and `sb_publishable_` key are accepted; configuration errors never echo key values. The placeholder UI does not import the client or perform database operations yet.

Run client configuration checks with:

```sh
node --experimental-vm-modules scripts/verify-supabase-client.mjs
npm run build
```

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Auth profile triggers](https://supabase.com/docs/guides/auth/managing-user-data).
