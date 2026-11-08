import html from './listing-details.html?raw';
import './listing-details.css';
import { mountListingDetails } from '../../components/listing-details/listing-details.js';

export const title = 'Listing Details';

export function mount(container, { params }) {
  container.innerHTML = html;
  return mountListingDetails(container.querySelector('[data-details-host]'), { listingId: params.id });
}
