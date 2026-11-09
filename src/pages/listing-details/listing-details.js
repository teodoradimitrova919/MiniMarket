import html from './listing-details.html?raw';
import './listing-details.css';
import { mountListingDetails } from '../../components/listing-details/listing-details.js';
import { createListingModals } from '../../components/listing-modals/listing-modals.js';

export const title = 'Listing Details';

export function mount(container, { params, auth, navigate }) {
  container.innerHTML = html;
  const back = container.querySelector('[data-back-my-listings]');
  const updateNavigation = () => { back.hidden = !auth.getState().user; };
  updateNavigation();
  const unsubscribe = auth.subscribe(updateNavigation);
  const modals = createListingModals({ auth, onChanged: () => navigate('/my-listings'), focusFallback: () => container.querySelector('h1') });
  const disposeDetails = mountListingDetails(container.querySelector('[data-details-host]'), { listingId: params.id, auth, onDelete: (listing, trigger) => modals.openDelete(listing, trigger) });
  const cleanup = () => { unsubscribe(); disposeDetails(); modals.dispose(); };
  cleanup.canLeave = modals.canLeave;
  return cleanup;
}
