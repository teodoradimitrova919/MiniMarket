# Listing attachments

The private `listing-attachments` bucket accepts JPEG, PNG, WebP and PDF files up to 5 MB. The database serializes registration per listing and allows up to five images and five PDFs. Original names are display/download metadata only. Paths are `<listing UUID>/<attachment UUID>.<extension>`; uploads never overwrite.

Migration `20261108224311_listing_attachments.sql` is applied to MiniMarket project `kkcfqkwkdcqvnurbdxus`. It adds attachment metadata, RLS, bucket-specific Storage policies, private authorization/cleanup helpers and deletion guards. Existing listing visibility, roles and unrelated policies are preserved. The uploader, timestamp, size and MIME are derived from the authenticated request and stored object rather than trusted insert values. Storage enforces declared MIME and size; this is not an antivirus or binary-content scanning service.

Owners and current authorized admins can upload/remove files for writable listings. Anonymous users and other users cannot mutate them. Metadata reads follow the parent listing SELECT policy. Browser mutations use the existing RLS-scoped client. Helpers that need privileged lookups live in the private schema, use an empty search path, and check the current actor; no privileged key reaches the browser.

## Private viewing and downloads

The deployed `listing-attachment-urls` Edge Function accepts at most 50 attachment IDs, never caller-supplied paths or buckets. It queries with the anonymous client, so only records visible through parent-listing RLS are signed with the server-only client. Each URL lasts five minutes. The endpoint intentionally allows unauthenticated reads (`verify_jwt = false`), validates input, checks the configured origin allowlist, and sends `Cache-Control: no-store`. Download filenames are URL-encoded. Signed URLs are bearer capabilities and can be shared until expiration.

`attachment-service.js` batches thumbnail lookups/signing and caches links for less than five minutes using elapsed local time to tolerate clock differences. Failed/missing links show a fallback; view/download actions request a fresh link, and image failures retry once. The shared listing form supports multiple previews and retains remaining selected files after failure. It saves the listing first and remembers its ID, so retrying does not create duplicates. Page disposal releases object URLs and event listeners. Shared details render the responsive gallery and PDF downloads in both pages and modals. Existing legacy images remain a fallback.

## Cleanup and retries

An upload is registered only after Storage succeeds. Failed metadata insertion attempts to remove the new object; a failed compensation is reported with a Retry file cleanup action. That action enumerates the listing folder and removes only unregistered files; Storage policies recheck registration under the same listing lock to avoid a registration/cleanup race. Pending deletion reservations block new uploads and metadata writes.

Attachment removal first authorizes and records deletion intent, removes the object using Storage APIs, then removes metadata. A metadata failure can be retried even after the object is gone. Database triggers reject metadata or listing deletion while related Storage objects remain. No code deletes directly from `storage.objects`.

The deployed `minimarket-admin` cleanup function now enumerates both legacy images and attachment folders before listing deletion. It freezes the listing before cleanup, retains the listing and reservation on failure, and supports owner-authorized retries. Admin Auth deletion freezes the account, cleans all owned listing folders (including unregistered uploads), deletes dependent rows, and deletes Auth last. Admin deletion impact includes documents. Existing admins and last-admin protection are unchanged.

Storage and Postgres operations cannot form a single transaction: a process interruption may leave a registered but missing file or an unregistered uploaded file. Missing files are handled gracefully, and removal/folder cleanup is retryable. Automatic background cleanup is not scheduled; the editor cleanup action or listing deletion is required after an interrupted upload. When cleanup cannot complete, errors remain visible and listing/Auth deletion is blocked rather than reporting success.

## Reproducible verification

`node scripts/verify-attachments.mjs` uses ignored `.env.seed.local` server configuration and `.env.local` public configuration. It creates marked temporary accounts/listings/files, tests real RLS/Storage/signed URLs and failure/retry paths, and cleans fixtures in `finally`. Secrets are never printed.

`node scripts/verify-attachments-browser.mjs` additionally requires a running Vite server at `http://127.0.0.1:5180`, `PLAYWRIGHT_MODULE_PATH` pointing to a separately installed Playwright `index.mjs`, and `CHROME_PATH` pointing to Chrome. It tests multiple previews, injected partial upload failure, retry without duplicates, editing/removal, anonymous gallery/downloads, card thumbnails and mobile overflow. Screenshots are written under ignored `node_modules/.attachment-verification/`.

Run `node --experimental-vm-modules scripts/verify-attachment-service.mjs` for mocked upload/registration/compensation failures and signing cache checks. Run the existing service/auth/unsaved-change checks and `npm run build` as regressions. The broader legacy CRUD browser test could not complete Chrome's beforeunload tab-close check (close-event timeout); its interrupted fixtures were explicitly cleaned up. The separate modal regression checks cover create/edit, permission denial, deletion retries and responsive layouts.

No Netlify deployment is part of this feature. Function configuration is recorded in `supabase/config.toml`; `minimarket-admin` retains JWT verification. Public signer origin defaults are the same localhost ports as the existing admin function. Add the intended frontend origin through the server-only configuration before any future deployment. The security advisor reports only the existing disabled leaked-password protection warning; no Auth setting was changed.

References: [Storage authorization](https://supabase.com/docs/guides/storage/security/access-control), [signed URL batches](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls).
