# MiniMarket administration

## Adding users and clearing search

Users Management includes **Clear filters** to reset the search and pagination. Clearing the search input (including its native clear control) also reloads all users; stale filtered responses cannot overwrite newer results.

**Add User** opens the shared modal for display name, email, password, and User/Administrator role (default User). The deployed `users.create` action verifies the caller's current administrator role before invoking server-only Auth Admin `createUser`. It validates these fields and confirms the email immediately. Auth triggers provision the regular User role; Administrator selections then use the caller-authorized `admin_set_role` RPC, never user metadata. If promotion cannot be confirmed, the UI reports that the account exists and directs the administrator to Edit User to finish the change. Role changes also remain available through Edit User. The admin's own session is preserved; no welcome email is sent. Successful creation resets search and refreshes the table. Duplicate emails and invalid passwords show errors without creating another account. Passwords are never returned and are cleared after success; fields are removed when the modal closes. No database schema changes are needed.

Run `node scripts/verify-admin-create-handler.mjs` for local authorization, validation, partial-promotion and safe-response checks. `scripts/verify-admin-user-create.mjs` uses the same ignored configuration and separate Playwright setup as the existing admin browser suite. Run with `ADMIN_CREATE_ROLE=user` and then `ADMIN_CREATE_ROLE=admin`. It verifies search resets, validation, duplicate submission/email handling, actual login, the selected authoritative role and profile mirror, actual admin permissions, preserved admin session, anonymous/non-admin denials, and mobile controls. It creates a uniquely named temporary account and deletes it in `finally`. References: [server-only Auth user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Routes: `/admin`, `/admin/listings`, `/admin/categories`, and `/admin/users`. The shared header shows **Admin Panel** only after a verified admin role is loaded. Every admin subroute is guarded. Database RLS and server authorization enforce permissions independently of the router.

## Database and roles

The confirmed project is `kkcfqkwkdcqvnurbdxus`. Applied migrations, in order:

1. `20261108082659_initial_minimarket_schema.sql` — original marketplace schema.
2. `20261108163728_admin_roles_panel.sql` — `app_role`, `user_roles`, backfill, trusted default role assignment, cleanup reservations, RPCs, Storage bucket/policies, and ownership/image integrity guards.
3. `20261108164837_admin_rpc_hardening.sql` — moves elevated implementations into `private`, leaves public invoker wrappers, and explicitly denies client access to cleanup state.

The migrations are already applied and the local versions match hosted history. Do not rerun or modify applied files. For another clean database, apply the entire ordered migration history through the supported Supabase CLI. CLI 3 targets local databases by default; inspect `supabase db push --help` before intentionally selecting a hosted target. No Netlify deployment is part of this work.

`user_roles.user_id` is both its primary key and a cascading FK to Auth. The enum permits only `user` and `admin`. Backfill preserves existing profile admins. Signup creates a regular profile and role regardless of metadata. `profiles.role` remains a compatibility mirror; the frontend and RLS now read authoritative `user_roles`, not metadata or the mirror. The seed script uses server-side role updates and remains limited to its marked demo accounts.

Authenticated users may select their own role; admins may read all roles. Clients have no direct role INSERT/UPDATE/DELETE grant. Edit User includes a User/Administrator selector; its Edge Function calls `admin_set_role(target, desired)` using the authenticated caller. The RPC verifies the current database role under a shared transaction advisory lock. Privileged trusted SQL can also manage assignments. A database trigger prevents deleting/demoting the last active admin, including FK cascades, and mirrors accepted changes into profiles. User deletion reservations use the same lock, excluding pending deletions from the count of usable admins. Self-demotion refreshes the app's auth state and redirects out of the Admin Panel.

The `private` schema must remain outside exposed API schemas. Elevated implementations have an empty search path, explicit caller authorization, and restricted EXECUTE privileges. Public RPCs are invoker wrappers. Trigger functions are not executable by API roles. Private deletion tables have RLS, no client grants, and explicit deny policies. Public listing/category SELECT policies remain intact. Listing ownership cannot be changed, including by admins. Categories still use an FK with RESTRICT; the panel blocks deleting in-use categories and never silently deletes or reassigns their listings.

## Bootstrap an explicitly selected administrator

Use a trusted database connection belonging to a database administrator, outside the application:

```sh
psql "<trusted database connection>" -v admin_user_id='<existing Auth user UUID>' -f scripts/bootstrap-admin.sql
```

The supplied UUID is required; the script never chooses a user. Its role upsert is transactional and safe to repeat. Missing users fail the FK check. Do not put the connection password or privileged credentials in frontend configuration, repository files, or chat. Sign out/in or refresh the app's auth state after a trusted role change.

## Edge Function configuration and deployment

`supabase/functions/minimarket-admin/` contains the deployed function and a dependency-injected handler for controlled verification. The SDK import is pinned to `@supabase/supabase-js@2.119.0`. `verify_jwt=true` remains enabled. Every request additionally validates its bearer token using Auth `getUser(token)` and reads the caller's current role under RLS. Privileged Auth APIs run only in the Edge Function. User endpoints require admin; listing cleanup also permits the verified listing owner through an authorized database RPC.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function. An optional server-only `MINIMARKET_ADMIN_SECRET_KEY` may replace the built-in privileged key. Never use a `VITE_` prefix. The function refuses a project URL other than the confirmed MiniMarket URL. No privileged key is embedded in function source or frontend bundles.

`MINIMARKET_ALLOWED_ORIGINS` is a comma-separated exact allowlist. Defaults cover `http://localhost:5173`, `http://127.0.0.1:5173`, and their port 5180 equivalents. Unknown origins receive 403. Authenticated non-browser clients without Origin still require a valid JWT and current database authorization. CORS does not replace authentication. There is no wildcard origin.

For a future hosted frontend, put the real intended origin and any optional server key in ignored `.env.edge.local`, using only these required values. Do not invent a hosting URL. With a scoped CLI access token authorized for this project, reproducible CLI 3 commands are:

```sh
npm exec --yes --package=supabase@3.0.0 -- supabase secrets set --remote=kkcfqkwkdcqvnurbdxus --env-file .env.edge.local --yes
npm exec --yes --package=supabase@3.0.0 -- supabase functions deploy minimarket-admin --remote=kkcfqkwkdcqvnurbdxus --use-api --yes
```

These are explicit hosted mutations. Do not add `--no-verify-jwt`. The current function was deployed through the scoped MCP and verified live; no manual deployment is currently pending. CORS defaults support local development. Update secrets and redeploy before using a different frontend origin.

The JSON POST API supports `users.list`, `users.view`, `users.update`, `users.impact`, `users.delete`, `listing.delete`, `images.attach`, `images.remove`, and `images.cleanup`. Inputs and allowed update fields are validated. Responses are whitelisted user ID/email/name/role/registration date/listing count/deletion-pending values; never raw Auth records, metadata, hashes, credentials, or tokens. Responses use `Cache-Control: no-store`. Unsupported fields/actions fail. Auth Admin listing is paginated; since it has no search parameter, searching name/email scans Auth pages server-side and then paginates matches. This is suitable for the classroom dataset; a larger deployment should add an indexed server-side directory.

Approved user edits are profile display name, Auth email, and the authoritative `user`/`admin` application role. Role values are validated before any writes. Email uses Auth Admin `updateUserById({email})`, which changes it directly without a confirmation email flow. Passwords and arbitrary authentication metadata cannot be edited through this endpoint. Unchanged identity fields are skipped. Email is updated first, then display name, and role last through the guarded RPC. If a later step fails, the response reports that earlier identity changes may already be saved; retrying completes the allowed update. Role-only failures do not modify name/email. The safe response is assembled before role changes so a successful self-demotion needs no subsequent privileged read.

## Listing images and deletion

The public `listing-images` bucket permits JPEG, PNG, and WebP files up to 5 MB. Paths are `<owner UUID>/<listing UUID>/<random UUID>.<extension>`. Storage policies permit an active owner or admin to insert into the matching listing folder; files are immutable, with random names and no overwrite policy. Normal Storage deletion is limited to unreferenced images. Database image changes must reference an existing object in the matching listing folder. Objects belonging to a different listing cannot be attached. Public image reads are intentional product data.

The Admin Listings **Image** dialog uploads, attaches/removes the image, and retries orphan cleanup. Its actions save immediately and are explicitly labelled. Image upload uses the caller's RLS-scoped Storage client; the server validates attachment and generates the project URL. Cleanup of unused images also uses the caller's Storage RLS, so a concurrent edit cannot cause deletion of a newly attached file. Owner/listing row locks serialize Storage metadata writes with deletion reservations. If attachment fails, the new unreferenced upload is removed where possible; any leftover remains discoverable in the same folder for cleanup. A saved attachment with failed old-file cleanup is reported as pending and can be retried. Existing seller Add/Edit form behavior is preserved; this phase adds the image controls to the admin listing page.

Listing deletion freezes the selected listing, removes its folder through the Storage API, then deletes the row. Existing FK cascades remove favorites. A Storage failure preserves the listing and reservation for retry. Direct database deletion of a listing that still has Storage objects is rejected; the existing owner delete service automatically uses the same owner-authorized cleanup endpoint when needed. External image URLs are never fetched or deleted by cleanup.

## User deletion sequence

The panel first loads impact: owned listings, listing images, own favorites, and favorites referring to owned listings. The administrator must type the exact email. Self-deletion from the Admin Panel is unavailable, and the database prevents removal of the last active admin.

1. Reserve deletion under the role-management lock and lock the target account. Persist a private retry marker. Listing, image, favorite-insert, and role operations now reject new writes for that account.
2. Ban the Auth account using the supported Admin API. The reservation already freezes app writes if this step fails.
3. Enumerate and remove all objects under that user's bucket prefix, including unreferenced uploads, through Storage APIs. No storage metadata is deleted directly with SQL.
4. Delete owned listings (cascading related favorites), then remaining favorites owned by the target.
5. Delete the Auth account through Auth Admin only after cleanup succeeds. Profiles, role, and private reservation then cascade.

Failures stop the sequence and return a fixed actionable message. The Auth account is preserved until dependent cleanup completes. Users with pending cleanup show **Retry deletion**; a repeated confirmation resumes idempotent steps. Ownership is never transferred, and unrelated users/objects are never deleted. Ban/freeze plus RLS avoids relying on access-token revocation alone. Existing tokens can still read intentionally public marketplace data. Other users' favorites referencing a deleted listing are related data and follow the existing FK cascade.

## Verification and current limits

`scripts/verify-admin.mjs` uses ignored server configuration and the optional separate Playwright tool. Set `PLAYWRIGHT_MODULE_PATH`, optionally `CHROME_PATH`, and `ADMIN_TEST_URL` (default `http://127.0.0.1:5180`), start Vite, then run `node scripts/verify-admin.mjs`. It creates only uniquely marked temporary accounts/categories/listings/images. The real Sofia admin is used for authorized operations on fixtures only. Cleanup runs in `finally` and removes marked fixtures. Passwords, tokens, and credentials are never printed.

Live checks cover role defaults/metadata rejection, escalation and private-data denials, last-admin protection, CORS, user DTO fields and pagination/search, owner/admin listing access, ownership invariants, category FK/uniqueness, image RLS/upload/public display, cleanup failure/retry, Auth-last user deletion, allowed user edits, browser routes/modals, table refreshes, responsive layout, and history. Partial failures are injected into the actual handler while retaining real Auth/RPC/database calls. Existing marketplace/auth/CRUD regressions and npm checks are run separately.

`scripts/verify-user-roles.mjs` specifically checks role promotion/demotion through the deployed endpoint, ordinary-user denials, invalid-role rejection before writes, the profile mirror, selector save/cancel/dirty behavior, duplicate prevention, disabled controls, refreshed table roles, responsive layout, and successful self-demotion with immediate access removal. It changes only marked temporary accounts and cleans them up. `scripts/verify-last-admin-role.sql` checks the live database's last-admin guard in a rollback-only transaction under the role-management lock; run the entire file through trusted SQL/MCP. It reports a skip if more than one admin is active and never changes existing roles permanently. The Edit User form submits only changed fields, avoiding overwriting a concurrent role change when the role selector was left untouched.

There is no listing status column, category hierarchy, category description, or category image in this schema. The panel does not invent them. It shows real totals and states that all listings are public. In-use category deletion is blocked rather than adding reassignment behavior. The security advisor has no new database findings; its remaining Auth warning is the pre-existing disabled leaked-password protection setting. No unrelated Auth settings or Netlify deployment were changed.

References: [Auth Admin email changes](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [securing functions](https://supabase.com/docs/guides/functions/auth), [Storage authorization](https://supabase.com/docs/guides/storage/security/access-control).
