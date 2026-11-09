import html from './listings.html?raw';
import './listings.css';
import { createListingCard } from '../../components/listing-card/listing-card.js';
import { readListingFilters, resolveCategory, filterListings } from '../../utils/listing-filters.js';
import { showError } from '../../services/toast-service.js';
import { mountFavoriteControls } from '../../components/favorite-controls.js';
import { bindFilterReset } from '../../utils/filter-reset.js';

export const title = 'Browse Listings';

export function mount(container, { navigate, auth }) {
  container.innerHTML = html;
  const events = new AbortController();
  let cards = new AbortController();
  let active = true;
  let loading = false;
  let listings;
  let categories;
  const form = container.querySelector('[data-browse-filters]');
  const search = form.elements.search;
  const category = form.elements.category;
  const sort = form.elements.sort;
  const grid = container.querySelector('[data-browse-grid]');
  const favorites = mountFavoriteControls(grid, { auth });
  const count = container.querySelector('[data-browse-count]');
  const feedback = container.querySelector('[data-browse-feedback]');

  function updateLocation() {
    // Query-only history updates preserve loaded listings and filter focus.
    const filters = readListingFilters(location.search);
    search.value = filters.search;
    sort.value = filters.sort;
    category.querySelector('[data-unknown-category]')?.remove();
    const selected = resolveCategory(filters.category, categories || []);
    if (filters.category && !selected) {
      const option = new Option(categories ? 'Unavailable category' : 'Loading selected category…', filters.category);
      option.dataset.unknownCategory = '';
      category.append(option);
    }
    category.value = selected?.id || filters.category;
    if (!listings || !categories || loading) return;
    cards.abort();
    cards = new AbortController();
    const matches = filterListings(listings, categories, filters);
    count.textContent = `${matches.length} ${matches.length === 1 ? 'listing' : 'listings'}`;
    const content = document.createDocumentFragment();
    for (const listing of matches) {
      const column = document.createElement('div');
      column.className = 'col';
      const card = createListingCard(listing, { signal: cards.signal, showDescription: true, favorites: true });
      card.querySelector('[data-listing-link]').dataset.listingId = listing.id;
      column.append(card);
      content.append(column);
    }
    grid.replaceChildren(content);
    favorites.refresh();
    feedback.hidden = matches.length > 0;
    feedback.textContent = listings.length ? 'No listings match your search and category. Try another search or clear the filters.' : 'No listings yet. Check back soon for new finds.';
    feedback.setAttribute('role', 'status');
  }

  function applyFilters(event) {
    event?.preventDefault();
    const params = new URLSearchParams(location.search);
    params.delete('q');
    for (const [key, value] of [['search', search.value.trim()], ['category', category.value], ['sort', sort.value === 'newest' ? '' : sort.value]]) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    navigate(`/listings${params.size ? `?${params}` : ''}`);
  }

  async function load() {
    if (loading) return;
    loading = true;
    feedback.hidden = false;
    feedback.setAttribute('role', 'status');
    feedback.textContent = 'Loading marketplace listings…';
    grid.setAttribute('aria-busy', 'true');
    count.textContent = '';
    category.disabled = true;
    const results = await Promise.allSettled([
      listings ? Promise.resolve(listings) : import('../../services/listings-service.js').then(({ getListings }) => getListings()),
      categories ? Promise.resolve(categories) : import('../../services/categories-service.js').then(({ getCategories }) => getCategories()),
    ]);
    if (!active) return;
    loading = false;
    grid.setAttribute('aria-busy', 'false');
    if (results[0].status === 'fulfilled') listings = results[0].value;
    if (results[1].status === 'fulfilled') categories = results[1].value;
    if (categories) {
      category.replaceChildren(new Option('All Categories', ''), ...categories.map(({ id, name }) => new Option(name, id)));
      category.disabled = false;
    }
    if (results.some((result) => result.status === 'rejected')) {
      const message = 'The marketplace could not be loaded. Please try again.';
      feedback.textContent = message;
      feedback.setAttribute('role', 'alert');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-outline-success d-block mx-auto';
      retry.textContent = 'Try again';
      retry.addEventListener('click', load, { once: true, signal: events.signal });
      feedback.append(retry);
      showError(message);
      return;
    }
    updateLocation();
  }

  form.addEventListener('submit', applyFilters, { signal: events.signal });
  category.addEventListener('change', applyFilters, { signal: events.signal });
  sort.addEventListener('change', applyFilters, { signal: events.signal });
  bindFilterReset(form,{signal:events.signal,onClear:()=>{if(location.search||location.hash)navigate('/listings');else updateLocation();},onSearchCleared:()=>{if(readListingFilters(location.search).search)applyFilters();}});
  updateLocation();
  load();
  const cleanup = () => { active = false; events.abort(); cards.abort(); favorites.dispose(); };
  cleanup.updateLocation = updateLocation;
  return cleanup;
}
