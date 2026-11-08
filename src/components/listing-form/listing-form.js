import html from './listing-form.html?raw';
import './listing-form.css';
import { validateText, validatePrice, validateId } from '../../utils/validation.js';
import { createUnsavedChangesGuard } from '../../utils/unsaved-changes.js';
import { showError } from '../../services/toast-service.js';

export function mountListingForm(container, { navigate, auth, listingId } = {}) {
  container.innerHTML = html;
  const userId = auth.getState().user.id;
  const form = container.querySelector('form');
  const fields = container.querySelector('[data-listing-fields]');
  const status = container.querySelector('[data-listing-form-status]');
  const back = container.querySelector('[data-form-back]');
  const save = container.querySelector('[data-save-listing]');
  const cancel = container.querySelector('[data-cancel-listing]');
  const errorPanel = container.querySelector('[data-save-error]');
  const events = new AbortController();
  const controls = Object.fromEntries(['title', 'description', 'price', 'category_id'].map((name) => [name, form.elements.namedItem(name)]));
  const readValues = () => Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value]));
  let active = true;
  let pending = false;
  let loading = false;
  let guard;
  let categories = [];
  let service;
  const isCurrent = () => active && auth.getState().user?.id === userId;

  function feedback(message, retry = false) {
    status.setAttribute('aria-busy', 'false');
    const panel = document.createElement('div');
    panel.className = 'listing-form-feedback'; panel.setAttribute('role', retry ? 'alert' : 'status');
    const text = document.createElement('p'); text.textContent = message; panel.append(text);
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-success'; button.textContent = 'Try again';
      button.addEventListener('click', load, { signal: events.signal }); panel.append(button);
    }
    status.replaceChildren(panel);
  }
  function fieldError(name, message) {
    controls[name].classList.add('is-invalid'); controls[name].setAttribute('aria-invalid', 'true');
    container.querySelector(`[data-error="${name}"]`).textContent = message;
  }
  function clearErrors() {
    errorPanel.hidden = true;
    for (const control of Object.values(controls)) { control.classList.remove('is-invalid'); control.removeAttribute('aria-invalid'); }
    container.querySelectorAll('[data-error]').forEach((element) => { element.textContent = ''; });
  }
  async function load() {
    if (loading || !isCurrent()) return;
    loading = true;
    form.hidden = true; back.hidden = false;
    feedback(listingId ? 'Loading your listing…' : 'Loading categories…');
    status.setAttribute('aria-busy', 'true');
    try {
      const [listings, categoryService] = await Promise.all([import('../../services/listings-service.js'), import('../../services/categories-service.js')]);
      service = listings;
      const [availableCategories, listing] = await Promise.all([categoryService.getCategories(), listingId ? listings.getListingById(listingId) : null]);
      if (!isCurrent()) return;
      if (listingId && (!listing || (listing.owner_id !== userId && auth.getState().profile?.role !== 'admin'))) {
        feedback('This listing is unavailable or you do not have permission to edit it.'); return;
      }
      categories = availableCategories;
      if (!categories.length) { feedback('No categories are available yet. Please try again later.', true); return; }
      controls.category_id.replaceChildren(new Option('Choose a category', ''));
      for (const category of categories) controls.category_id.add(new Option(category.name, category.id));
      if (listing) {
        controls.title.value = listing.title;
        controls.description.value = listing.description || '';
        controls.price.value = String(listing.price);
        controls.category_id.value = listing.category_id;
      }
      guard?.dispose();
      guard = createUnsavedChangesGuard(form, readValues);
      status.replaceChildren(); status.setAttribute('aria-busy', 'false');
      fields.disabled = false; form.hidden = false; back.hidden = true;
    } catch (error) {
      if (!isCurrent()) return;
      if (error.code === 'VALIDATION_ERROR') feedback('This listing is unavailable or you do not have permission to edit it.');
      else { feedback('The form could not be loaded. Please try again.', true); showError('The listing form could not be loaded. Please try again.'); }
    } finally { loading = false; }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || loading || !isCurrent()) return;
    clearErrors();
    const values = readValues();
    const validators = { title: (value) => validateText(value, 'Title'), price: validatePrice,
      category_id: (value) => { validateId(value, 'Category'); if (!categories.some((category) => category.id === value)) throw new Error('Choose an available category.'); return value; } };
    const data = { description: values.description };
    let firstInvalid;
    for (const [name, validate] of Object.entries(validators)) {
      try { data[name] = validate(values[name]); } catch (error) { fieldError(name, error.message); firstInvalid ||= controls[name]; }
    }
    if (firstInvalid) { firstInvalid.focus(); return; }
    pending = true; save.disabled = true; fields.disabled = true;
    cancel.classList.add('disabled'); cancel.setAttribute('aria-disabled', 'true'); cancel.tabIndex = -1;
    save.textContent = 'Saving…'; form.setAttribute('aria-busy', 'true');
    try {
      if (listingId) await service.updateListing(listingId, data);
      else await service.createListing(data);
      if (!isCurrent()) return;
      guard.markClean();
      navigate('/my-listings'); // Services already publish the single success toast.
    } catch (error) {
      if (!isCurrent()) return;
      if (error.code === '23503') fieldError('category_id', 'This category is no longer available. Choose another category.');
      errorPanel.textContent = error.message || 'Your listing could not be saved. Please try again.';
      errorPanel.hidden = false; errorPanel.focus();
    } finally {
      pending = false;
      if (isCurrent()) {
        save.disabled = false; fields.disabled = false; save.textContent = 'Save Listing'; form.setAttribute('aria-busy', 'false');
        cancel.classList.remove('disabled'); cancel.removeAttribute('aria-disabled'); cancel.removeAttribute('tabindex');
      }
    }
  }, { signal: events.signal });
  cancel.addEventListener('click', (event) => { if (pending) event.preventDefault(); }, { signal: events.signal });
  void load();
  const cleanup = () => { active = false; events.abort(); guard?.dispose(); };
  cleanup.canLeave = () => {
    if (pending && guard?.isDirty()) return window.confirm('Your listing is being saved. Leaving will not cancel the request. Leave this page?');
    return guard?.canLeave() ?? true;
  };
  return cleanup;
}
