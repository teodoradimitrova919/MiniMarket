# Database services

The database services import the shared Supabase client. Configure the public variables in `.env.local` from `.env.example` and restart Vite. Home calls read services; other marketplace pages remain placeholders.

For the implemented registration/login/logout, session state, and protected routes, see [Authentication](AUTH.md). Home now reads categories and the latest listings through these services; other marketplace pages remain placeholders.

## Listings

| Function | Result |
| --- | --- |
| `getListings()` | All listing rows, newest first; ID breaks timestamp ties |
| `getLatestListings()` | Up to eight newest rows with nested `category.name`, for Home |
| `getListingById(id)` | Listing row, or `null` if absent |
| `getMyListings()` | Current user's rows, newest first |
| `createListing(data)` | Created row |
| `updateListing(id, data)` | Updated row; accepts partial changes |
| `deleteListing(id)` | `{ id }` of the deleted row |

Create requires a non-blank `title`, UUID `category_id`, and valid `price`. Price accepts a number or decimal string from 0 to 9,999,999,999.99, with at most two decimal places; empty values, booleans, non-finite numbers, and values requiring rounding are rejected. Decimal strings use a dot and no currency symbol. Optional `description` and `image_url` accept text or null; blank text becomes null. This phase stores an existing image URL string only and performs no upload.

Updates validate every provided editable field and reject empty changes. Only title, category_id, price, description, and image_url enter the payload. Caller-supplied owner IDs, row IDs, timestamps, and other fields are ignored. Creation always assigns the verified current user's ID; updates cannot transfer ownership. The database maintains updated_at.

Own-listing reads and all mutations call `auth.getUser()` first. Update/delete filter by listing ID and let RLS authorize the owner or administrator; they do not add an owner filter that would prevent legitimate admin operations. Zero affected rows produce `NOT_FOUND_OR_FORBIDDEN`, rather than reporting success.

## Categories

`getCategories()` returns all rows ordered by name, then ID, and needs no session. `createCategory(name)` and `updateCategory(id, name)` return the written row. `deleteCategory(id)` returns `{ id }`. Mutations require a signed-in user; RLS enforces administrator status. Names are trimmed and must not be blank. Uniqueness follows the database's exact, case-sensitive name constraint. Duplicate names and deletion of categories still used by listings get specific errors.

## Favorites

All functions require a verified current user. IDs always come from that user, and reads/deletes explicitly filter by user_id in addition to RLS.

- `getFavorites()` returns listing rows ordered by when they were saved (newest first), not favorite relationship rows. Null joined listings are omitted.
- `addFavorite(listingId)` returns the created favorite relationship row. The unique database constraint handles duplicate/concurrent additions; duplicates reject with code `23505` and a friendly message.
- `removeFavorite(listingId)` returns `true` when removed and `false` when already absent.
- `isFavorite(listingId)` returns a boolean.

All collection reads use stable ordering and range requests to avoid the default API row limit. They accumulate results into one array, appropriate to this initial small application; a future browsing UI may expose pagination. Concurrent changes between page requests are not a snapshot.

## Errors

Functions resolve to the documented values and throw an `Error` on failure. Errors have a readable `message` and a `code`: `AUTH_REQUIRED`, `VALIDATION_ERROR`, `NOT_FOUND_OR_FORBIDDEN`, `REQUEST_FAILED`, or the original Supabase/Postgres code (such as `42501`, `23505`, or `23503`). Database error details are retained as `cause` for debugging, without adding their raw text to the user-facing message. Pages should render error messages as text.

## Verification

```sh
npm test
node --experimental-vm-modules scripts/verify-supabase-client.mjs
node --experimental-vm-modules scripts/verify-services.mjs --live
npm run build
```

`npm test` uses the actual service/utility modules with a mocked client and makes no network calls. It checks query scopes, authenticated IDs, field allowlists, validation, pagination, returned values, duplicate/error handling, and authentication gates. Mocked RLS errors are not proof of database authorization.

`--live` additionally runs anonymous reads and missing-session checks with the real SDK. Configuration prefers environment values, then `.env.local`, then the public `.env.example`. It creates no records and does not sign in. Only use this option with a publishable key.

For this implementation, mocked checks, live anonymous reads, client checks, and the production build passed. The existing `scripts/verify-database.sql` was rerun separately through scoped MCP: visitor, owner, other-user, and administrator SQL role checks passed, including listing CRUD restrictions, category permissions, and private/unique favorites. Every fixture was rolled back; no schema changes were needed.

**Not performed during service implementation:** authenticated JavaScript service integration calls using real user/admin sessions; no Auth test accounts existed at that time. The later [demo seed](../../scripts/SEED.md) adds demo accounts and records. Real-session service creation, own-listing retrieval, update/delete, cross-user rejection, category admin mutations, and favorite mutations/privacy/duplicates still need service integration verification. SQL role checks and mocked service checks do not substitute for those calls.
