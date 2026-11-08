import Modal from 'bootstrap/js/dist/modal';
import html from './listing-modals.html?raw';
import './listing-modals.css';
import { mountListingForm } from '../listing-form/listing-form.js';
import { mountListingDetails } from '../listing-details/listing-details.js';
import { showError } from '../../services/toast-service.js';
import { bindModalTabLoop } from '../../utils/modal-focus.js';

export function createListingModals({ auth, onChanged, focusFallback, deleteOperation } = {}) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const events = new AbortController();
  const dialogs = Object.fromEntries(['form', 'view', 'delete'].map(name => [name, host.querySelector(`#${name === 'form' ? 'listing-form' : `${name}-listing`}-modal`)]));
  const modals = Object.fromEntries(Object.entries(dialogs).map(([name, dialog]) => [name, new Modal(dialog)]));
  let active = true;
  let opened;
  let opener;
  let formCleanup;
  let viewCleanup;
  let selected;
  let deleting = false;
  let forceClose = false;
  const accountId = auth?.getState().user?.id;
  const authorized = () => active && accountId && auth?.getState().user?.id === accountId;
  function requireAccount() {
    if (authorized()) return true;
    showError('Please sign in to manage listings.');
    return false;
  }
  function canLeave() { return formCleanup?.canLeave() ?? true; }
  function restoreFocus() {
    if (!active) return;
    const target = opener?.isConnected ? opener : focusFallback?.();
    target?.focus({ preventScroll: true });
  }
  async function refresh() {
    try { await onChanged?.(); }
    catch { if (active) showError('Your listings could not be refreshed. Please reload the page.'); }
    finally { if (active && !opened) restoreFocus(); }
  }
  for (const [name, dialog] of Object.entries(dialogs)) {
    bindModalTabLoop(dialog, events.signal);
    dialog.addEventListener('hide.bs.modal', event => {
      if (forceClose) return;
      if ((name === 'delete' && deleting) || (name === 'form' && (formCleanup?.isPending() || !canLeave()))) event.preventDefault();
    }, { signal: events.signal });
    dialog.addEventListener('hidden.bs.modal', () => {
      if (name === 'form') { formCleanup?.(); formCleanup = undefined; dialogs.form.querySelector('[data-modal-form-host]').replaceChildren(); }
      if (name === 'view') { viewCleanup?.(); viewCleanup = undefined; dialogs.view.querySelector('[data-modal-details-host]').replaceChildren(); }
      selected = undefined;
      opened = undefined;
      restoreFocus();
    }, { signal: events.signal });
  }
  function openView(id, trigger = document.activeElement) {
    if (!active || opened) return;
    opened = 'view'; opener = trigger;
    dialogs.view.querySelector('[data-details-page]').href = `/listings/${encodeURIComponent(id)}`;
    viewCleanup = mountListingDetails(dialogs.view.querySelector('[data-modal-details-host]'), { listingId: id });
    modals.view.show(trigger);
  }
  function openForm(id, trigger = document.activeElement) {
    if (!active || opened || !requireAccount()) return;
    opened = 'form'; opener = trigger;
    dialogs.form.querySelector('.modal-title').textContent = id ? 'Edit Listing' : 'Add Listing';
    formCleanup = mountListingForm(dialogs.form.querySelector('[data-modal-form-host]'), {
      auth, listingId: id,
      onCancel: () => modals.form.hide(),
      onReady: () => { if (active && opened === 'form') dialogs.form.querySelector('[name="title"]')?.focus(); },
      onSaved: () => {
        forceClose = true;
        modals.form.hide();
        forceClose = false;
        // Refresh failures belong to the table, not to the already successful save.
        if (active) void refresh();
      },
    });
    modals.form.show(trigger);
  }
  function openDelete(listing, trigger = document.activeElement) {
    if (!active || opened || !requireAccount()) return;
    const state = auth.getState();
    if (listing.owner_id !== state.user.id && state.profile?.role !== 'admin') { showError('You do not have permission to delete this listing.'); return; }
    opened = 'delete'; opener = trigger; selected = listing;
    dialogs.delete.querySelector('[data-delete-title]').textContent = listing.title;
    dialogs.delete.querySelector('[data-delete-error]').hidden = true;
    modals.delete.show(trigger);
  }
  const confirm = dialogs.delete.querySelector('[data-confirm-delete]');
  confirm.addEventListener('click', async () => {
    if (deleting || !selected || !requireAccount()) return;
    deleting = true;
    const errorPanel = dialogs.delete.querySelector('[data-delete-error]');
    errorPanel.hidden = true;
    dialogs.delete.setAttribute('aria-busy', 'true');
    dialogs.delete.querySelectorAll('button').forEach(button => { button.disabled = true; });
    confirm.textContent = 'Deleting…';
    try {
      const id = selected.id;
      const { deleteListing } = await import('../../services/listings-service.js');
      if (!authorized()) return;
      await (deleteOperation || deleteListing)(id);
      if (!authorized()) return;
      deleting = false;
      modals.delete.hide();
      if (active) void refresh();
    } catch {
      if (authorized()) { errorPanel.textContent = 'The listing could not be deleted. Please try again.'; errorPanel.hidden = false; }
    } finally {
      deleting = false;
      if (active) {
        dialogs.delete.setAttribute('aria-busy', 'false');
        dialogs.delete.querySelectorAll('button').forEach(button => { button.disabled = false; });
        confirm.textContent = 'Delete Listing';
      }
    }
  }, { signal: events.signal });
  return {
    openView, openAdd: trigger => openForm(undefined, trigger), openEdit: openForm, openDelete, canLeave,
    closeView() {
      if (opened !== 'view') return false;
      modals.view.hide();
      return true;
    },
    dispose() {
      active = false; forceClose = true; events.abort();
      formCleanup?.(); viewCleanup?.();
      for (const modal of Object.values(modals)) { modal.hide(); modal.dispose(); }
      host.remove();
    },
  };
}

// Keep modified clicks and link targets native so existing page routes stay available.
export function isPlainLinkClick(event, link) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && !link.hasAttribute('download') && (!link.target || link.target === '_self');
}
