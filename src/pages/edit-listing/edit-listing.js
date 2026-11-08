import html from './edit-listing.html?raw';
import './edit-listing.css';
import { mountListingForm } from '../../components/listing-form/listing-form.js';

export const title = 'Edit Listing';
export function mount(container, context) {
  container.innerHTML = html;
  return mountListingForm(container.querySelector('[data-listing-form-host]'), { ...context, listingId: context.params.id });
}
