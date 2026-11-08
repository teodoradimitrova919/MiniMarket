import html from './favorites.html?raw';
import './favorites.css';
import { createListingCard } from '../../components/listing-card/listing-card.js';
import { mountFavoriteControls } from '../../components/favorite-controls.js';
import { showError } from '../../services/toast-service.js';

export const title = 'Favorites';

export function mount(container, { auth }) {
  container.innerHTML = html;
  const events = new AbortController();
  const grid = container.querySelector('[data-favorites-grid]');
  const feedback = container.querySelector('[data-favorites-feedback]');
  const userId = auth.getState().user.id;
  let active = true, loading = false, records = [], controls;
  let cards = new AbortController();
  const current = () => active && auth.getState().user?.id === userId;
  function render() {
    cards.abort(); cards = new AbortController();
    grid.replaceChildren();
    for (const listing of records) {
      const column = document.createElement('div'); column.className = 'col'; column.dataset.favoriteListing = listing.id;
      column.append(createListingCard(listing, { signal: cards.signal, showDescription: true, favorites: true }));
      grid.append(column);
    }
    controls?.refresh();
    feedback.replaceChildren(); feedback.setAttribute('role', 'status');
    if (!records.length) {
      const icon = document.createElement('i'); icon.className = 'bi bi-heart display-5 d-block mb-3'; icon.setAttribute('aria-hidden', 'true');
      const message = document.createElement('p'); message.textContent = "You haven't saved any listings yet.";
      const link = document.createElement('a'); link.className = 'btn btn-primary'; link.href = '/listings'; link.textContent = 'Browse Listings';
      feedback.className = 'favorites-feedback'; feedback.append(icon, message, link);
    } else feedback.className = '';
  }
  async function load() {
    if (loading || !current()) return;
    loading = true; grid.setAttribute('aria-busy', 'true');
    feedback.textContent = 'Loading your saved listings…'; feedback.setAttribute('role', 'status');
    try {
      const { getUserFavorites } = await import('../../services/favorites-service.js');
      const rows = await getUserFavorites(); if (!current()) return;
      records = rows; controls?.dispose();
      controls = mountFavoriteControls(grid, { auth, initialIds: records.map(row => row.id), onRemoved(id) {
        if (!current()) return;
        const index = records.findIndex(row => row.id === id);
        records = records.filter(row => row.id !== id); render();
        const buttons = grid.querySelectorAll('[data-favorite-id]');
        (buttons[Math.min(index, buttons.length - 1)] || feedback.querySelector('a'))?.focus();
      } });
      render();
    } catch {
      if (!current()) return;
      feedback.textContent = 'Your favorites could not be loaded. Please try again.'; feedback.setAttribute('role', 'alert');
      const retry = document.createElement('button'); retry.className = 'btn btn-outline-success d-block mx-auto mt-3'; retry.textContent = 'Try again'; retry.type = 'button';
      retry.addEventListener('click', load, { once: true, signal: events.signal }); feedback.append(retry);
      showError('Your favorites could not be loaded. Please try again.');
    } finally { loading = false; if (current()) grid.setAttribute('aria-busy', 'false'); }
  }
  void load();
  return () => { active = false; events.abort(); cards.abort(); controls?.dispose(); records = []; };
}
