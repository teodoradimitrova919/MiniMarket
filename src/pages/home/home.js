import html from './home.html?raw';
import './home.css';
import { createListingCard } from '../../components/listing-card/listing-card.js';
import { categoryIcon } from '../../utils/category-icons.js';
import { showError } from '../../services/toast-service.js';
import { bindFilterReset } from '../../utils/filter-reset.js';

export const title = 'Home';

export function mount(container, { navigate } = {}) {
  container.innerHTML = html;
  const events = new AbortController();
  bindFilterReset(container.querySelector('[data-home-search]'),{signal:events.signal,button:container.querySelector('[data-clear-filters]'),searchName:'q'});
  let active = true;
  const categoriesRegion = container.querySelector('[data-home-categories]');
  const listingsRegion = container.querySelector('[data-home-listings]');

  function feedback(region, message, { loading = false, retry } = {}) {
    region.setAttribute('aria-busy', String(loading));
    const panel = document.createElement('div');
    panel.className = 'home-feedback';
    panel.setAttribute('role', retry ? 'alert' : 'status');
    if (loading) {
      const spinner = document.createElement('span');
      spinner.className = 'spinner-border spinner-border-sm me-2';
      spinner.setAttribute('aria-hidden', 'true');
      panel.append(spinner);
    }
    const text = document.createElement('span');
    text.textContent = message;
    panel.append(text);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-success d-block mx-auto';
      button.textContent = 'Try again';
      button.addEventListener('click', retry, { signal: events.signal });
      panel.append(button);
    }
    region.replaceChildren(panel);
  }

  async function loadCategories() {
    feedback(categoriesRegion, 'Loading categories…', { loading: true });
    try {
      // Configuration errors stay inside the page, leaving the shared shell usable.
      const { getCategories } = await import('../../services/categories-service.js');
      const categories = await getCategories();
      if (!active) return;
      if (!categories.length) { feedback(categoriesRegion, 'Categories are on their way. Browse all listings in the meantime.'); return; }
      const grid = document.createElement('div');
      grid.className = 'row row-cols-2 row-cols-md-3 row-cols-lg-6 g-3';
      for (const category of categories) {
        const column = document.createElement('div');
        column.className = 'col';
        const link = document.createElement('a');
        link.className = 'home-category';
        link.href = `/listings?${new URLSearchParams({ category: category.id })}`;
        const icon = document.createElement('i');
        icon.className = `bi bi-${categoryIcon(category.name)}`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = category.name;
        link.append(icon, label);
        column.append(link);
        grid.append(column);
      }
      categoriesRegion.replaceChildren(grid);
      categoriesRegion.setAttribute('aria-busy', 'false');
    } catch {
      if (active) {
        feedback(categoriesRegion, 'We couldn’t load categories. Please try again.', { retry: loadCategories });
        showError('Marketplace data could not be loaded. Please try again.');
      }
    }
  }

  async function loadListings() {
    feedback(listingsRegion, 'Loading the latest listings…', { loading: true });
    try {
      const { getLatestListings } = await import('../../services/listings-service.js');
      const listings = await getLatestListings();
      if (!active) return;
      if (!listings.length) { feedback(listingsRegion, 'No listings yet. Be the first to give something a new home.'); return; }
      const grid = document.createElement('div');
      grid.className = 'row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-4';
      for (const listing of listings) {
        const column = document.createElement('div');
        column.className = 'col';
        column.append(createListingCard(listing, { signal: events.signal }));
        grid.append(column);
      }
      listingsRegion.replaceChildren(grid);
      listingsRegion.setAttribute('aria-busy', 'false');
    } catch {
      if (active) {
        feedback(listingsRegion, 'We couldn’t load the latest listings. Please try again.', { retry: loadListings });
        showError('Marketplace data could not be loaded. Please try again.');
      }
    }
  }

  container.querySelector('[data-home-search]').addEventListener('submit', (event) => {
    if (!navigate) return;
    event.preventDefault();
    const term = new FormData(event.currentTarget).get('q').trim();
    navigate(term ? `/listings?${new URLSearchParams({ search: term })}` : '/listings');
  }, { signal: events.signal });

  void loadCategories();
  void loadListings();
  return () => {
    active = false;
    events.abort();
  };
}
