import html from './listing-details.html?raw';
import './listing-details.css';
import { formatPrice } from '../../utils/format-price.js';
import { safeImageUrl } from '../../utils/image-url.js';
import { showError } from '../../services/toast-service.js';
import { mountListingAttachments } from '../listing-attachments/listing-attachments.js';
import { mountFavoriteControls } from '../favorite-controls.js';
import { createImageCredit } from '../image-credit.js';

export function mountListingDetails(container, { listingId, auth, onDelete }) {
  container.innerHTML = html;
  const events = new AbortController();
  let active = true;
  let loading = false;
  let attachments;
  let favorites;
  let listingRecord, ownerLoading = false;
  const status = container.querySelector('[data-details-status]');
  const content = container.querySelector('[data-details-content]');
  const ownerStatus = container.querySelector('[data-owner-status]');
  const ownerRetry = container.querySelector('[data-owner-retry]');
  async function loadOwner() {
    if (ownerLoading || !active) return;
    ownerLoading = true; ownerRetry.hidden = true;
    ownerStatus.textContent = 'Loading seller contact details…';
    try {
      const { getListingOwner } = await import('../../services/listing-owner-service.js');
      const owner = await getListingOwner(listingId);
      if (!active) return;
      const name = container.querySelector('[data-owner-name]'), email = container.querySelector('[data-owner-email]');
      name.textContent = owner.name; name.hidden = false;
      email.textContent = owner.email || ''; email.hidden = !owner.email;
      if (owner.email) email.href = `mailto:${encodeURIComponent(owner.email)}`;
      ownerStatus.textContent = owner.email ? '' : 'Email unavailable.';
    } catch {
      if (active) { ownerStatus.textContent = 'Seller contact details are unavailable. Please try again.'; ownerRetry.hidden = false; }
    } finally { ownerLoading = false; }
  }
  ownerRetry.addEventListener('click', () => void loadOwner(), { signal: events.signal });
  container.querySelector('[data-owner-delete]').addEventListener('click', event => {
    if (listingRecord && auth?.getState().user?.id === listingRecord.owner_id) onDelete?.(listingRecord, event.currentTarget);
  }, { signal: events.signal });
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
      listingRecord = listing;
      const ownerRequest = loadOwner();
      container.querySelector('[data-owner-actions]').hidden = auth?.getState().user?.id !== listing.owner_id;
      container.querySelector('[data-owner-edit]').href = `/listings/${encodeURIComponent(listing.id)}/edit`;
      for (const [name, value] of Object.entries({ title: listing.title, category: listing.category?.name || 'Uncategorized', price: formatPrice(listing.price), description: listing.description || 'No description provided.' })) {
        container.querySelector(`[data-details-${name}]`).textContent = value;
      }
      const url = safeImageUrl(listing.image_url);
      const favorite = container.querySelector('[data-favorite-id]');
      favorite.dataset.favoriteId = listing.id;
      favorite.dataset.favoriteTitle = listing.title;
      favorites?.dispose();
      favorites = mountFavoriteControls(container, { auth });
      attachments?.dispose();
      let hasAttachmentImages = false;
      attachments = mountListingAttachments(container.querySelector('[data-listing-attachments]'), {
        listingId,
        imageContainer: container.querySelector('[data-details-gallery]'),
        onImagesChange(hasImages) { hasAttachmentImages = hasImages; container.querySelector('.listing-details-media').hidden = hasImages; },
      });
      // Resolve the preferred image before revealing content; never flash the legacy image first.
      await attachments.ready;
      if (!active) return;
      if (!hasAttachmentImages && url) {
        const credit = createImageCredit(url);
        container.querySelector('[data-image-credit]')?.remove();
        if (credit) { credit.dataset.imageCredit = ''; container.querySelector('.listing-details-media').after(credit); }
        const image = container.querySelector('[data-details-image]');
        image.alt = listing.title;
        image.src = url;
        try {
          await image.decode();
          if (!active) return;
          image.hidden = false;
          container.querySelector('[data-details-placeholder]').hidden = true;
          container.querySelector('.listing-details-media').classList.add('has-photo');
        } catch { /* Keep the no-photo placeholder when a legacy image is unavailable. */ }
      } else {
        const primary = container.querySelector('[data-details-gallery] img:not([hidden])');
        if (primary) await primary.decode().catch(() => {});
      }
      if (!active) return;
      await ownerRequest;
      if (!active) return;
      status.hidden = true;
      content.hidden = false;
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
