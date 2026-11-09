import html from './my-listings.html?raw';
import './my-listings.css';
import { formatPrice } from '../../utils/format-price.js';
import { formatDate } from '../../utils/format-date.js';
import { showError } from '../../services/toast-service.js';
import { createListingModals, isPlainLinkClick } from '../../components/listing-modals/listing-modals.js';
import { createListingThumbnail } from '../../components/listing-thumbnail.js';

export const title = 'My Listings';
export function mount(container, { auth }) {
  container.innerHTML = html;
  const userId = auth.getState().user.id;
  const status = container.querySelector('[data-my-listings-status]');
  const table = container.querySelector('[data-my-listings-table]');
  const rows = container.querySelector('[data-listing-rows]');
  const events = new AbortController();
  let rowEvents = new AbortController();
  let active = true;
  let loading = false;
  let reloadRequested = false;
  let records = [];
  const isCurrent = () => active && auth.getState().user?.id === userId;
  const modals = createListingModals({ auth, onChanged: load, focusFallback: () => container.querySelector('[data-add-listing]') });
  function feedback(message, retry = false) {
    const panel = document.createElement('div'); panel.className = 'my-listings-feedback'; panel.setAttribute('role', retry ? 'alert' : 'status');
    const text = document.createElement('p'); text.textContent = message; panel.append(text);
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-success'; button.textContent = 'Try again';
      button.addEventListener('click', load, { signal: events.signal }); panel.append(button);
    }
    status.replaceChildren(panel);
  }
  function actionLink(label, icon, href, id) {
    const link = document.createElement('a'); link.className = 'btn btn-sm btn-outline-secondary'; link.href = href;
    link.dataset.modalAction = label.toLowerCase(); link.dataset.modalListingId = id;
    const image = document.createElement('i'); image.className = `bi bi-${icon} me-1`; image.setAttribute('aria-hidden', 'true');
    link.append(image, document.createTextNode(label)); return link;
  }
  function renderRows() {
    rowEvents.abort(); rowEvents = new AbortController();
    const fragment = document.createDocumentFragment();
    for (const listing of records) {
      const row = document.createElement('tr'); row.dataset.listingId = listing.id;
      const imageCell = document.createElement('td'); imageCell.append(createListingThumbnail(listing, { signal: rowEvents.signal }));
      const titleCell = document.createElement('td');
      const title = document.createElement('span'); title.className = 'my-listing-title text-truncate d-block'; title.textContent = listing.title; title.title = listing.title;
      titleCell.append(title);
      const category = document.createElement('td'); category.textContent = listing.category?.name || 'Uncategorized';
      const price = document.createElement('td'); price.className = 'my-listing-price'; price.textContent = formatPrice(listing.price);
      const date = document.createElement('td'); date.className = 'text-nowrap'; date.textContent = formatDate(listing.created_at);
      const actions = document.createElement('td'); const group = document.createElement('div'); group.className = 'd-flex flex-nowrap gap-2';
      const href = `/listings/${encodeURIComponent(listing.id)}`;
      group.append(actionLink('View', 'eye', href, listing.id), actionLink('Edit', 'pencil', `${href}/edit`, listing.id));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-sm btn-outline-danger'; button.textContent = 'Delete'; button.dataset.deleteListing = listing.id;
      button.setAttribute('aria-label', `Delete ${listing.title}`); group.append(button); actions.append(group);
      row.append(imageCell, titleCell, category, price, date, actions); fragment.append(row);
    }
    rows.replaceChildren(fragment);
  }
  async function load() {
    if (!isCurrent()) return;
    if (loading) { reloadRequested = true; return; }
    loading = true; table.hidden = true; status.setAttribute('aria-busy', 'true'); feedback('Loading your listings…');
    try {
      const service = await import('../../services/listings-service.js');
      const listings = await service.getMyListings();
      if (!isCurrent()) return;
      records = listings;
      if (!records.length) { rows.replaceChildren(); feedback('Your next chapter starts here. You haven’t posted any listings yet. Use Add New Listing to share your first item.'); }
      else { renderRows(); status.replaceChildren(); table.hidden = false; }
    } catch {
      if (isCurrent()) { feedback('Your listings could not be loaded. Please try again.', true); showError('Your listings could not be loaded. Please try again.'); }
    } finally {
      loading = false;
      if (isCurrent()) {
        status.setAttribute('aria-busy', 'false');
        if (reloadRequested) { reloadRequested = false; void load(); }
      }
    }
  }
  container.addEventListener('click', event => {
    if (!isCurrent()) return;
    const add = event.target.closest('[data-add-listing]');
    if (add && isPlainLinkClick(event, add)) { event.preventDefault(); modals.openAdd(add); return; }
    const link = event.target.closest('[data-modal-action]');
    if (link && isPlainLinkClick(event, link)) {
      event.preventDefault();
      if (link.dataset.modalAction === 'view') modals.openView(link.dataset.modalListingId, link);
      else modals.openEdit(link.dataset.modalListingId, link);
      return;
    }
    const button = event.target.closest('[data-delete-listing]');
    const listing = button && records.find(record => record.id === button.dataset.deleteListing);
    if (listing) modals.openDelete(listing, button);
  }, { signal: events.signal });
  void load();
  const cleanup = () => { active = false; events.abort(); rowEvents.abort(); modals.dispose(); };
  cleanup.canLeave = modals.canLeave;
  return cleanup;
}
