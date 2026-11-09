import { validateAttachmentFile } from './attachment-validation.js';
import { serviceError } from './service-errors.js';

export function prepareListingImageUpload(listing, file) {
  const validated = validateAttachmentFile({ name: file?.name || 'product-photo', type: file?.type, size: file?.size });
  if (!validated.type.startsWith('image/')) throw serviceError('Choose a JPEG, PNG, or WebP image up to 5 MB.', 'VALIDATION_ERROR');
  return { path: `${listing.owner_id}/${listing.id}/${crypto.randomUUID()}.${validated.extension}`, options: { contentType: validated.type, upsert: false } };
}

// Authorization remains with the caller's Supabase client/RLS. No privileged client is created here.
export async function storeListingImage(client, upload, file, metadata) {
  const bucket = client.storage.from('listing-images');
  const result = await bucket.upload(upload.path, file, { ...upload.options, ...(metadata ? { metadata } : {}) });
  if (result.error) throw serviceError('Unable to upload image.', 'STORAGE_ERROR');
  return bucket.getPublicUrl(upload.path).data.publicUrl;
}
