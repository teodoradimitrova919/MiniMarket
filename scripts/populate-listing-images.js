// Server-only maintenance tool. Never import this module into the frontend.
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readConfig } from './seed.js';
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES } from '../src/utils/attachment-validation.js';
import { prepareListingImageUpload, storeListingImage } from '../src/utils/listing-image-upload.js';

const stateDir = new URL('../.image-population.local/', import.meta.url);
const creditFile = new URL('../src/data/populated-image-credits.json', import.meta.url);
const catalogFile = new URL('./listing-image-sources.json', import.meta.url);
const downloadHosts = new Set(['upload.wikimedia.org', 'images.unsplash.com', 'images.pexels.com']);
const hostRetryAt = new Map();

export function validateSource(source) {
  const download = new URL(source.downloadUrl), origin = new URL(source.sourceUrl), license = new URL(source.licenseUrl);
  if (download.protocol !== 'https:' || !downloadHosts.has(download.hostname) || download.username || download.password
      || origin.protocol !== 'https:' || license.protocol !== 'https:' || !source.author || !source.title || source.illustrative !== true
      || !['commons.wikimedia.org', 'unsplash.com', 'www.pexels.com'].includes(origin.hostname)
      || !['creativecommons.org', 'unsplash.com', 'www.pexels.com'].includes(license.hostname)
      || !/^[0-9a-f]{64}$/.test(source.sha256 || '') || !['image/jpeg', 'image/png', 'image/webp'].includes(source.mime)
      || !/^(CC BY(?:-SA)? [234]\.0|CC BY-SA 2\.5|CC0|Unsplash License|Pexels License)$/.test(source.license)) {
    throw new Error('Source lacks a reviewed content hash, image MIME type, attribution, or reusable license.');
  }
}

export function validateImage(bytes, type) {
  const extension = validateAttachmentFile({ name: 'product-photo', type, size: bytes.length }).extension;
  const signature = type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : type === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!signature) throw new Error('Image MIME type or file signature is invalid.');
  return extension;
}

async function downloadImage(source) {
  validateSource(source);
  const cache = new URL(`cache-${createHash('sha256').update(source.downloadUrl).digest('hex')}.bin`, stateDir);
  if (source.sha256) {
    try {
      const bytes = await readFile(cache);
      if (createHash('sha256').update(bytes).digest('hex') === source.sha256) return { bytes, type: source.mime, extension: validateImage(bytes, source.mime), sha256: source.sha256 };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const host = new URL(source.downloadUrl).hostname;
  if (Date.now() < (hostRetryAt.get(host) || 0)) throw new Error('Image host is rate limited; retry a later run. No upload attempted.');
  const response = await fetch(source.downloadUrl, { redirect: 'error', signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'MiniMarket/1.0 licensed product image population' } });
  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get('retry-after');
      const until = /^\d+$/.test(retry || '') ? Date.now() + Number(retry) * 1000 : Date.parse(retry || '') || Date.now() + 60000;
      hostRetryAt.set(host, until);
    }
    await response.body?.cancel();
    throw new Error(`Image download returned HTTP ${response.status}; no upload attempted.`);
  }
  const type = response.headers.get('content-type')?.split(';')[0];
  if (Number(response.headers.get('content-length')) > MAX_ATTACHMENT_BYTES) { await response.body.cancel(); throw new Error('Image exceeds 5 MB.'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_ATTACHMENT_BYTES) throw new Error('Image exceeds 5 MB.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (source.sha256 && sha256 !== source.sha256) throw new Error('Source image changed since review; recheck its content and license.');
  const extension = validateImage(bytes, type);
  await writeFile(cache, bytes);
  return { bytes, type, extension, sha256 };
}

async function rows(client, table, columns) {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from(table).select(columns).order('id').range(offset, offset + 99);
    if (error) throw new Error(`Cannot read ${table}; no further changes attempted.`);
    result.push(...data); if (data.length < 100) return result;
  }
}

async function json(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function save(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }
const protectedFields = ['title', 'description', 'price', 'category_id', 'owner_id', 'created_at'];

export function planListing(listing, attachments, catalog) {
  if (listing.image_url || attachments.some(a => a.listing_id === listing.id && a.mime_type.startsWith('image/'))) return { action: 'existing' };
  const source = catalog.find(s => s.title === listing.title);
  if (!source) return { action: 'skip', reason: 'No reviewed image source; item cannot be identified reliably.' };
  validateSource(source);
  return { action: 'populate', source };
}

export async function populate(client, { apply = false, download = downloadImage, catalogPath = catalogFile, creditPath = creditFile, stateDirectory = stateDir } = {}) {
  const catalog = await json(catalogPath, []), credits = await json(creditPath, []);
  catalog.forEach(validateSource);
  const listings = await rows(client, 'listings', '*,category:categories(name)');
  const attachments = await rows(client, 'listing_attachments', 'id,listing_id,mime_type,storage_path');
  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError || !buckets?.some(b => b.name === 'listing-images' && b.public) || !buckets?.some(b => b.name === 'listing-attachments' && !b.public)) throw new Error('Expected existing public image and private attachment buckets. No bucket changes made.');
  const bucket = client.storage.from('listing-images');
  const report = { dryRun: !apply, inspectedAt: new Date().toISOString(), total: listings.length, alreadyContainingImages: 0, populated: 0, planned: 0, skipped: 0, failed: 0, records: [] };
  await mkdir(stateDirectory, { recursive: true });
  const journalFile = new URL('journal.json', stateDirectory);
  const journal = await json(journalFile, []);

  // Recover only files created by this tool. An ambiguous read never permits deletion.
  if (apply) for (const entry of [...journal]) {
    if (!new RegExp(`^${entry.ownerId}/${entry.listingId}/[0-9a-f-]+\\.(jpg|png|webp)$`).test(entry.path)) throw new Error('Invalid recovery journal path.');
    const { data: linked, error } = await client.from('listings').select('image_url').eq('id', entry.listingId).maybeSingle();
    if (error) throw new Error('Cannot resolve previous upload; journal retained for retry.');
    if (linked?.image_url === entry.imageUrl) {
      if (!credits.some(c => c.imageUrl === entry.imageUrl)) credits.push(entry.credit);
      await save(creditPath, credits);
    } else {
      const { error: cleanupError } = await bucket.remove([entry.path]);
      if (cleanupError) throw new Error('Previous orphan cleanup failed; retry before uploading more images.');
    }
    journal.splice(journal.indexOf(entry), 1); await save(journalFile, journal);
  }

  for (const listing of listings) {
    const plan = planListing(listing, attachments, catalog);
    const record = { id: listing.id, title: listing.title, category: listing.category?.name, action: plan.action };
    report.records.push(record);
    if (plan.action === 'existing') { report.alreadyContainingImages++; continue; }
    if (plan.action === 'skip') { report.skipped++; record.reason = plan.reason; continue; }
    report.planned++; record.source = plan.source;
    if (!apply) continue;
    let entry;
    try {
      const image = await download(plan.source);
      const current = await rows(client, 'listing_attachments', 'id,listing_id,mime_type');
      if (current.some(a => a.listing_id === listing.id && a.mime_type.startsWith('image/'))) { report.skipped++; record.action = 'skip'; record.reason = 'A user photo was added during this run.'; continue; }
      const file = new Blob([image.bytes], { type: image.type });
      const upload = prepareListingImageUpload(listing, file), path = upload.path;
      const imageUrl = bucket.getPublicUrl(path).data.publicUrl;
      const credit = { listingId: listing.id, imageUrl, ...plan.source, sha256: image.sha256 };
      entry = { ownerId: listing.owner_id, listingId: listing.id, path, imageUrl, credit };
      journal.push(entry); await save(journalFile, journal);
      await storeListingImage(client, upload, file, { tool: 'minimarket-image-population-v1', ...credit });
      // Conditional update preserves a concurrently edited cover, owner, or product description.
      let update = client.from('listings').update({ image_url: imageUrl }).eq('id', listing.id).is('image_url', null);
      for (const key of protectedFields) update = listing[key] === null ? update.is(key, null) : update.eq(key, listing[key]);
      const { data: changed, error: updateError } = await update.select('id');
      if (updateError || changed.length !== 1) throw new Error('Cover association failed or listing changed; upload scheduled for cleanup.');
      if (!credits.some(c => c.imageUrl === imageUrl)) credits.push(credit);
      await save(creditPath, credits);
      journal.splice(journal.indexOf(entry), 1); await save(journalFile, journal);
      report.populated++; record.action = 'populated'; record.imageUrl = imageUrl;
      console.log(`Populated: ${listing.title}`);
    } catch (error) {
      report.failed++; record.action = 'failed'; record.reason = error.message;
      // Re-read after ANY uncertain response, including an update that may have succeeded.
      if (entry) {
        const { data: linked, error: lookupError } = await client.from('listings').select('image_url').eq('id', listing.id).maybeSingle();
        if (!lookupError && linked?.image_url !== entry.imageUrl) {
          const { error: cleanupError } = await bucket.remove([entry.path]);
          if (!cleanupError) { journal.splice(journal.indexOf(entry), 1); await save(journalFile, journal); }
          else record.reason += ' Cleanup pending in local journal.';
        } else record.reason += ' Retained journal for safe recovery on next apply.';
      }
      console.log(`Failed: ${listing.title}: ${record.reason}`);
    }
  }
  if (apply) {
    const after = await rows(client, 'listings', '*');
    for (const before of listings) {
      const current = after.find(r => r.id === before.id);
      if (!current || protectedFields.some(key => current[key] !== before[key]) || (before.image_url && before.image_url !== current.image_url)) throw new Error('Final verification found a concurrent product change; inspect report.');
    }
    for (const record of report.records.filter(r => r.action === 'populated')) {
      const { data, error } = await bucket.info(decodeURIComponent(new URL(record.imageUrl).pathname.split('/listing-images/')[1]));
      if (error || !data?.size) throw new Error('A populated image failed Storage verification.');
    }
  }
  const mode = apply ? 'apply' : 'dry-run';
  await save(new URL(`${report.inspectedAt.replace(/[:.]/g, '-')}-${mode}.json`, stateDirectory), report);
  await save(new URL(`latest-${mode}-report.json`, stateDirectory), report);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => !['--apply', '--dry-run'].includes(a)) || args.length > 1) throw new Error('Usage: node --env-file=.env.seed.local scripts/populate-listing-images.js [--dry-run | --apply]');
  const { url, key } = readConfig(process.env);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const report = await populate(client, { apply: args.includes('--apply') });
  console.table(Object.fromEntries(Object.entries(report).filter(([,v]) => typeof v !== 'object')));
  for (const r of report.records) if (r.reason) console.log(`${r.title}: ${r.reason}`);
  if (report.failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Population stopped. Check server configuration or local journal/report; credentials are never logged.'); process.exitCode = 1; });
