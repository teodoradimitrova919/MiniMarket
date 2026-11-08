import html from './listing-details.html?raw';
import './listing-details.css';
import { formatPrice } from '../../utils/format-price.js';
import { safeImageUrl } from '../../utils/image-url.js';
import { showError } from '../../services/toast-service.js';
import { mountListingAttachments } from '../listing-attachments/listing-attachments.js';
import { mountFavoriteControls } from '../favorite-controls.js';

export function mountListingDetails(container, { listingId, auth }) {
  container.innerHTML = html;
  const events = new AbortController();
  let active = true;
  let loading = false;
  let attachments;
  let favorites;
  const status = container.querySelector('[data-details-status]');
  const content = container.querySelector('[data-details-content]');
  async function load() {
    if (!active || loading) return;
    loading = true;
    status.hidden = false;
    status.setAttribute('role', 'status');
    status.textContent = 'Loading listing…';
    content.hidden = true;
    container.setAttribute('aria-busy', 'true');
    try {
      const { getListingById } = await import('../../services/listings-service.js');
      const listing = await getListingById(listingId);
      if (!active) return;
      if (!listing) { status.textContent = 'This listing is no longer available.'; return; }
      for (const [name, value] of Object.entries({ title: listing.title, category: listing.category?.name || 'Uncategorized', price: formatPrice(listing.price), description: listing.description || 'No description provided.' })) {
        container.querySelector(`[data-details-${name}]`).textContent = value;
      }
      const url = safeImageUrl(listing.image_url);
      const favorite = container.querySelector('[data-favorite-id]');
      favorite.dataset.favoriteId = listing.id;
      favorite.dataset.favoriteTitle = listing.title;
      favorites?.dispose();
      favorites = mountFavoriteControls(container, { auth });
      if (url) {
        const image = container.querySelector('[data-details-image]');
        const placeholder = container.querySelector('[data-details-placeholder]');
        image.alt = listing.title;
        image.addEventListener('load', () => { placeholder.hidden = true; }, { once: true, signal: events.signal });
        image.addEventListener('error', () => { image.hidden = true; placeholder.hidden = false; }, { once: true, signal: events.signal });
        image.src = url;
        image.hidden = false;
      }
      status.hidden = true;
      content.hidden = false;
      attachments?.dispose();
      attachments = mountListingAttachments(container.querySelector('[data-listing-attachments]'), {
        listingId,
        imageContainer: container.querySelector('[data-details-gallery]'),
        onImagesChange(hasImages) { container.querySelector('.listing-details-media').hidden = hasImages; },
      });
    } catch (error) {
      if (!active) return;
      if (error.code === 'VALIDATION_ERROR') { status.textContent = 'This listing is no longer available.'; return; }
      const message = 'This listing could not be loaded. Please try again.';
      status.textContent = message;
      status.setAttribute('role', 'alert');
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'btn btn-outline-success d-block mt-3'; retry.textContent = 'Try again';
      retry.addEventListener('click', load, { once: true, signal: events.signal });
      status.append(retry);
      showError(message);
    } finally { loading = false; if (active) container.setAttribute('aria-busy', 'false'); }
  }
  void load();
  return () => { active = false; events.abort(); attachments?.dispose(); favorites?.dispose(); };
}
