import html from './listing-card.html?raw';
import './listing-card.css';
import { categoryIcon } from '../../utils/category-icons.js';
import { formatPrice } from '../../utils/format-price.js';
import { safeImageUrl } from '../../utils/image-url.js';
import { createImageCredit } from '../image-credit.js';

const template = document.createElement('template');
template.innerHTML = html;

export function createListingCard(listing, { signal, showDescription = false, favorites = false } = {}) {
  const card = template.content.firstElementChild.cloneNode(true);
  const category = listing.category?.name || 'Uncategorized';
  const favorite = card.querySelector('[data-favorite-id]');
  favorite.hidden = !favorites;
  favorite.dataset.favoriteId = listing.id;
  favorite.dataset.favoriteTitle = listing.title;
  card.querySelector('[data-listing-title]').textContent = listing.title;
  card.querySelector('[data-listing-category]').textContent = category;
  card.querySelector('[data-listing-price]').textContent = formatPrice(listing.price);
  card.querySelector('[data-listing-link]').href = `/listings/${encodeURIComponent(listing.id)}`;
  if (showDescription) {
    const description = card.querySelector('[data-listing-description]');
    const text = (listing.description || '').replace(/\s+/g, ' ').trim();
    description.textContent = text.length > 160 ? `${text.slice(0, 157)}…` : text || 'No description provided.';
    description.hidden = false;
    card.querySelector('[data-view-details]').hidden = false;
    card.querySelector('.listing-card-arrow').hidden = true;
  }
  card.querySelector('[data-placeholder-icon]').classList.add(`bi-${categoryIcon(category)}`);
  const url = safeImageUrl(listing.attachment_image_url || listing.image_url);
  const credit = createImageCredit(url);
  if (credit) card.append(credit);
  if (url) {
    const image = card.querySelector('[data-listing-image]');
    const placeholder = card.querySelector('[data-image-placeholder]');
    // A known photo is loading; do not briefly label it as a missing photo.
    placeholder.hidden = true;
    image.alt = listing.title;
    image.addEventListener('load', () => { placeholder.hidden = true; }, { once: true, signal });
    image.addEventListener('error', async () => {
      const fallback = () => { image.hidden = true; placeholder.hidden = false; };
      if (!listing.attachment_image_id) { fallback(); return; }
      try {
        const { getAttachmentUrl } = await import('../../services/attachment-service.js');
        const refreshed = await getAttachmentUrl(listing.attachment_image_id, { force: true });
        if (signal?.aborted) return;
        image.addEventListener('error', fallback, { once: true, signal });
        image.src = refreshed;
      } catch { if (!signal?.aborted) fallback(); }
    }, { once: true, signal });
    image.src = url;
    image.hidden = false;
  }
  return card;
}
