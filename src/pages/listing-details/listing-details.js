import html from './listing-details.html?raw';
import './listing-details.css';
import { mountListingDetails } from '../../components/listing-details/listing-details.js';

export const title = 'Listing Details';

export function mount(container, { params, auth }) {
  container.innerHTML = html;
  const back = container.querySelector('[data-back-my-listings]');
  const updateNavigation = () => { back.hidden = !auth.getState().user; };
  updateNavigation();
  const unsubscribe = auth.subscribe(updateNavigation);
  const disposeDetails = mountListingDetails(container.querySelector('[data-details-host]'), { listingId: params.id, auth });
  return () => { unsubscribe(); disposeDetails(); };
}
