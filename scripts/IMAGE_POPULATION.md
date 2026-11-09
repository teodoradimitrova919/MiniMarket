# Existing listing product images

Keep the existing buckets: `listing-images` is public for listing covers; `listing-attachments` is private for user images/PDFs and uses the existing scoped signed-URL service. A public cover bucket is appropriate because visitors can browse listings. PDFs remain private. No bucket or policy changes are required for population.

## Run locally

Use the existing ignored `.env.seed.local` server configuration (`SUPABASE_URL`, `MINIMARKET_PROJECT_REF`, and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`). Never use a `VITE_` variable for a privileged key. The existing configuration validator refuses another project.

```powershell
node --env-file=.env.seed.local scripts/populate-listing-images.js --dry-run
node --env-file=.env.seed.local scripts/populate-listing-images.js --apply
node scripts/verify-image-population.mjs
```

The default is dry-run. It retrieves every listing, its category/description, all attachment metadata and the existing buckets. It reports existing covers, planned additions and unmatched listings. It never changes existing photos, listing text, prices, owners or categories. Database triggers update `updated_at` when a missing cover is associated.

The reviewed catalog is `scripts/listing-image-sources.json`. Matching uses the complete product title, not an approximate category search; unknown products are skipped. To support another product, first read its description/category, find and visually inspect a licensed source, verify the author's reuse terms, then add its source URL, download URL, author, license URL, MIME type and SHA-256. Do not add random search-result images or premium Unsplash+ images. Future runs use the reviewed catalog rather than an unreviewed image-search API.

Images are illustrative references, including when the same brand/model is shown. They do not establish the item's exact color, dimensions, contents or condition. Shared cards/details show an illustrative-photo credit disclosure. Table thumbnails link to the source and identify the author/license in their accessible label. Existing user photos have no stock-photo label. Expanded credits retain source, license and cropping/resizing information; CC BY-SA image adaptations remain available under their source license. The application source code is not relicensed.

## Safety and recovery

- Reuses the existing public image uploader and validation, with JPEG/PNG/WebP only, a 5 MB cap, MIME/signature checks, reviewed content hashes, unique owner/listing/UUID paths, and `upsert: false`.
- Existing private image attachments take priority over a legacy cover. Any existing cover reference is preserved, including broken references that need manual investigation.
- Downloads have a timeout, streaming size limit, approved HTTPS hosts and no redirects. Reviewed bytes, reports and the recovery journal stay under ignored `.image-population.local`, which survives dependency reinstalls; source HTTP failures are reported without uploading anything for that item.
- Only a missing `image_url` is updated, conditional on the original product fields/owner still matching. User photos are rechecked before upload.
- Each new upload is journaled before writing. Failed associations remove only that new orphan, through the Storage API. An uncertain database response is resolved by reading the current cover before any deletion. If that read or cleanup fails, keep the journal and rerun `--apply` to recover. Do not delete the journal manually or run two population processes simultaneously.
- Source/author/license/hash are recorded in object metadata and `src/data/populated-image-credits.json`. Commit this small credit manifest with the UI. Downloaded images, credentials, cache and journal stay ignored.
- Repeated successful runs skip existing photos and create no new objects. Final verification checks product fields and new Storage objects. Unit checks cover dry-run, failed association cleanup, ambiguous success recovery and repeated-run idempotence.

## Verified population on 9 November 2026

| Result | Listings |
| --- | ---: |
| Inspected | 25 |
| Existing photos preserved | 7 |
| Missing covers populated | 17 |
| Skipped: unidentified `Test ITtem` | 1 |
| Failed uploads | 0 |
| Uploads on repeated apply | 0 |

All 17 new public URLs returned the exact reviewed image bytes, verified by SHA-256. Each previously empty listing has one new UUID object. All original attachment records and product fields were unchanged. Browser checks passed for Home, Browse, My Listings, Favorites, direct details, the detail modal, mobile layout and admin thumbnails; Dashboard has no listing-image component. Existing user upload/partial-failure retry/download/cleanup checks and `npm run build` passed.

Sources comprise 12 Wikimedia Commons files under their individual CC BY/CC BY-SA/CC0 terms, two Unsplash photos and three Pexels photos. Individual authors, source pages, license URLs and content hashes are in [the verified report](image-population-report.json) and the catalog. References such as the Lenovo laptop or Harry Potter edition represent the product family and may differ from the advertised specification. The pre-existing bee photo on `Wooden Animal Puzzle Set` was preserved; its mismatch needs owner review.

Running this script does not deploy the frontend. Credit UI changes become available when the frontend is subsequently deployed through the normal process.
