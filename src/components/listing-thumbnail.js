import { safeImageUrl } from '../utils/image-url.js';
import './listing-thumbnail.css';
import { imageCredit } from './image-credit.js';

export function createListingThumbnail(listing, { signal } = {}) {
  const frame = document.createElement('span'); frame.className = 'listing-thumbnail';
  const placeholder = document.createElement('span'); placeholder.className = 'listing-thumbnail-placeholder';
  placeholder.setAttribute('role', 'img'); placeholder.setAttribute('aria-label', 'No photo');
  const icon = document.createElement('i'); icon.className = 'bi bi-image'; icon.setAttribute('aria-hidden', 'true');
  placeholder.append(icon); frame.append(placeholder);
  const url = safeImageUrl(listing.attachment_image_url || listing.image_url);
  if (!url) return frame;
  let media = frame;
  const credit = imageCredit(url);
  if (credit) {
    const link = document.createElement('a');
    link.href = credit.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.title = `Illustrative photo (not actual item). ${credit.author}; ${credit.license}. ${credit.changes}`;
    link.setAttribute('aria-label', link.title + ' Open image source and license.');
    frame.append(link); link.append(placeholder);
    // The image and attribution share the source link without changing table dimensions.
    media = link;
  }
  placeholder.hidden = true;
  const image = document.createElement('img'); image.alt = listing.title; image.hidden = true; image.decoding = 'async';
  const fallback = () => { image.hidden = true; placeholder.hidden = false; };
  image.addEventListener('load', () => { image.hidden = false; placeholder.hidden = true; }, { signal });
  image.addEventListener('error', async () => {
    if (!listing.attachment_image_id) { fallback(); return; }
    try {
      const { getAttachmentUrl } = await import('../services/attachment-service.js');
      const refreshed = await getAttachmentUrl(listing.attachment_image_id, { force: true });
      if (signal?.aborted) return;
      image.addEventListener('error', fallback, { once: true, signal }); image.src = refreshed;
    } catch { if (!signal?.aborted) fallback(); }
  }, { once: true, signal });
  media.append(image); image.src = url;
  return frame;
}
