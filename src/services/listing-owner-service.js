import { supabase } from './supabase-client.js';
import { validateId } from '../utils/validation.js';
import { runQuery } from '../utils/service-errors.js';

export async function getListingOwner(listingId) {
  const result = await runQuery(supabase.functions.invoke('listing-owner', { body: { listingId: validateId(listingId, 'Listing ID') } }), 'Unable to load seller contact details');
  return result.owner;
}
