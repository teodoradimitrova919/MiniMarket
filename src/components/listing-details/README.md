# Shared listing details

Home/Favorites/Browse detail links and management preview modals use this component. Legacy and attachment images share fitted sizing; the primary image and attachment preference are resolved before content is revealed.

The Listed by panel shows the seller's profile name and Auth email. `listing-owner-service.js` calls the deployed `listing-owner` Edge Function with a listing ID. The function first checks anonymous parent-listing visibility, derives the owner ID from that row, then reads the required profile/Auth fields server-side. Its response contains only name and email. Caller-supplied user IDs and extra fields are rejected, missing/inaccessible listings return no contacts, responses are not cached, and exact production/local CORS origins are enforced. Email is intentionally public contact information on a publicly readable listing, as requested. No profile RLS or schema changes were made, and no privileged key is bundled into the frontend.

Contact failures show a retry action without hiding the listing. Async reads ignore disposed pages. Edit/Delete controls appear only when the verified current user owns the listing. Edit opens the existing edit route; Delete uses the shared confirmation modal and existing deletion service/RLS/Storage cleanup. Canonical deletion returns to My Listings. Preview deletion closes the preview, then opens confirmation and refreshes the management table after success.

The Home join/login block is guest-only and subscribes to verified auth state, with cleanup on unmount.

Verification: `node scripts/verify-listing-owner-handler.mjs`, `npm test`, and `npm run build`. With the existing separate Playwright tool and Vite setup, `node scripts/verify-seller-details.mjs` creates and cleans temporary fixtures to check anonymous contacts, authenticated Home visibility, non-owner restrictions, owner edit, cancel/delete from details and previews, navigation after deletion, and mobile layout. Public function configuration is recorded in `supabase/config.toml`.
