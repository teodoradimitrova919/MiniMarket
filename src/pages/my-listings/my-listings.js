import html from './my-listings.html?raw';
import './my-listings.css';
import Modal from 'bootstrap/js/dist/modal';
import { formatPrice } from '../../utils/format-price.js';
import { formatDate } from '../../utils/format-date.js';
import { showError } from '../../services/toast-service.js';

export const title = 'My Listings';
export function mount(container, { auth }) {
  container.innerHTML = html;
  const userId = auth.getState().user.id;
  const status = container.querySelector('[data-my-listings-status]');
  const table = container.querySelector('[data-my-listings-table]');
  const rows = container.querySelector('[data-listing-rows]');
  const dialog = container.querySelector('#delete-listing-modal');
  const confirmButton = dialog.querySelector('[data-confirm-delete]');
  const deleteError = dialog.querySelector('[data-delete-error]');
  const modal = new Modal(dialog);
  const events = new AbortController();
  let active = true;
  let loading = false;
  let pendingDelete = false;
  let records = [];
  let selected;
  let returnFocus;
  let service;
  const isCurrent = () => active && auth.getState().user?.id === userId;
  function feedback(message, retry = false) {
    const panel = document.createElement('div'); panel.className = 'my-listings-feedback'; panel.setAttribute('role', retry ? 'alert' : 'status');
    const text = document.createElement('p'); text.textContent = message; panel.append(text);
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-success'; button.textContent = 'Try again';
      button.addEventListener('click', load, { signal: events.signal }); panel.append(button);
    }
    status.replaceChildren(panel);
  }
  function actionLink(label, icon, href) {
    const link = document.createElement('a'); link.className = 'btn btn-sm btn-outline-secondary'; link.href = href;
    const image = document.createElement('i'); image.className = `bi bi-${icon} me-1`; image.setAttribute('aria-hidden', 'true');
    link.append(image, document.createTextNode(label)); return link;
  }
  function renderRows() {
    const fragment = document.createDocumentFragment();
    for (const listing of records) {
      const row = document.createElement('tr'); row.dataset.listingId = listing.id;
      const titleCell = document.createElement('td');
      const title = document.createElement('span'); title.className = 'my-listing-title text-truncate d-block'; title.textContent = listing.title; title.title = listing.title;
      titleCell.append(title);
      const category = document.createElement('td'); category.textContent = listing.category?.name || 'Uncategorized';
      const price = document.createElement('td'); price.className = 'my-listing-price'; price.textContent = formatPrice(listing.price);
      const date = document.createElement('td'); date.className = 'text-nowrap'; date.textContent = formatDate(listing.created_at);
      const actions = document.createElement('td'); const group = document.createElement('div'); group.className = 'd-flex flex-nowrap gap-2';
      const href = `/listings/${encodeURIComponent(listing.id)}`;
      group.append(actionLink('View', 'eye', href), actionLink('Edit', 'pencil', `${href}/edit`));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-sm btn-outline-danger'; button.textContent = 'Delete'; button.dataset.deleteListing = listing.id;
      button.setAttribute('aria-label', `Delete ${listing.title}`); group.append(button); actions.append(group);
      row.append(titleCell, category, price, date, actions); fragment.append(row);
    }
    rows.replaceChildren(fragment);
  }
  async function load() {
    if (loading || !isCurrent()) return;
    loading = true; table.hidden = true; status.setAttribute('aria-busy', 'true'); feedback('Loading your listings…');
    try {
      service = await import('../../services/listings-service.js');
      const listings = await service.getMyListings();
      if (!isCurrent()) return;
      records = listings;
      if (!records.length) { rows.replaceChildren(); feedback('Your next chapter starts here. You haven’t posted any listings yet. Use Add Listing to share your first item.'); }
      else { renderRows(); status.replaceChildren(); table.hidden = false; }
    } catch {
      if (isCurrent()) { feedback('Your listings could not be loaded. Please try again.', true); showError('Your listings could not be loaded. Please try again.'); }
    } finally { loading = false; if (isCurrent()) status.setAttribute('aria-busy', 'false'); }
  }
  rows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-listing]');
    if (!button || pendingDelete || !isCurrent()) return;
    selected = records.find((listing) => listing.id === button.dataset.deleteListing);
    if (!selected) return;
    returnFocus = button;
    dialog.querySelector('[data-delete-title]').textContent = selected.title;
    deleteError.hidden = true;
    modal.show(button);
  }, { signal: events.signal });
  dialog.addEventListener('hide.bs.modal', (event) => { if (pendingDelete) event.preventDefault(); }, { signal: events.signal });
  dialog.addEventListener('hidden.bs.modal', () => { selected = null; if (isCurrent() && returnFocus?.isConnected) returnFocus.focus(); }, { signal: events.signal });
  confirmButton.addEventListener('click', async () => {
    if (pendingDelete || !selected || !isCurrent()) return;
    pendingDelete = true; confirmButton.disabled = true; confirmButton.textContent = 'Deleting…'; deleteError.hidden = true;
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('[data-delete-cancel]').forEach((button) => { button.disabled = true; });
    try {
      await service.deleteListing(selected.id);
      if (!isCurrent()) return;
      pendingDelete = false;
      returnFocus = container.querySelector('[data-add-listing]');
      modal.hide();
      await load();
    } catch (error) {
      if (isCurrent()) { deleteError.textContent = error.message || 'The listing could not be deleted. Please try again.'; deleteError.hidden = false; }
    } finally {
      pendingDelete = false;
      if (isCurrent()) {
        dialog.setAttribute('aria-busy', 'false');
        confirmButton.disabled = false; confirmButton.textContent = 'Delete Listing';
        dialog.querySelectorAll('[data-delete-cancel]').forEach((button) => { button.disabled = false; });
      }
    }
  }, { signal: events.signal });
  void load();
  return () => { active = false; events.abort(); modal.hide(); modal.dispose(); };
}
