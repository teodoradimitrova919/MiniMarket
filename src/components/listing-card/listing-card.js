import html from './listing-card.html?raw';
import './listing-card.css';
import { categoryIcon } from '../../utils/category-icons.js';
import { formatPrice } from '../../utils/format-price.js';

const template = document.createElement('template');
template.innerHTML = html;

export function createListingCard(listing, { signal, showDescription = false } = {}) {
  const card = template.content.firstElementChild.cloneNode(true);
  const category = listing.category?.name || 'Uncategorized';
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
  let url;
  try { url = new URL(listing.image_url); } catch { /* Keep the placeholder. */ }
  if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
    const image = card.querySelector('[data-listing-image]');
    const placeholder = card.querySelector('[data-image-placeholder]');
    image.alt = listing.title;
    image.addEventListener('load', () => { placeholder.hidden = true; }, { once: true, signal });
    image.addEventListener('error', () => { image.hidden = true; placeholder.hidden = false; }, { once: true, signal });
    image.src = url.href;
    image.hidden = false;
  }
  return card;
}
