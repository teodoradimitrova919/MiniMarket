import html from './add-listing.html?raw';
import './add-listing.css';
import { mountListingForm } from '../../components/listing-form/listing-form.js';

export const title = 'Add Listing';
export function mount(container, context) {
  container.innerHTML = html;
  return mountListingForm(container.querySelector('[data-listing-form-host]'), context);
}
