import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { validateId, validateListing } from '../utils/validation.js';
import { requireRecord, runQuery } from '../utils/service-errors.js';
import { notifyMutation } from '../utils/operation-feedback.js';

function listingsQuery(columns = '*') {
  return supabase.from('listings').select(columns)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
}

export async function getListings() {
  return getAllRows(() => listingsQuery('*, category:categories(name)'), 'Unable to load listings');
}

export async function getLatestListings() {
  return runQuery(listingsQuery('*, category:categories(name)').limit(8), 'Unable to load latest listings');
}

export async function getListingById(id) {
  return runQuery(supabase.from('listings').select('*, category:categories(name)').eq('id', validateId(id, 'Listing ID')).maybeSingle(),
    'Unable to load listing');
}

export async function getMyListings() {
  const user = await requireUser();
  return getAllRows(() => listingsQuery('*, category:categories(name)').eq('owner_id', user.id), 'Unable to load your listings');
}

export async function createListing(data) {
  return notifyMutation(async () => {
    const user = await requireUser();
    const listing = { ...validateListing(data), owner_id: user.id };
    return runQuery(supabase.from('listings').insert(listing).select('*').single(), 'Unable to create listing',
      { '23503': 'The selected category no longer exists.' });
  }, { success: 'Listing created successfully.', error: 'The listing could not be created. Please try again.',
    errors: { '23503': 'The selected category no longer exists.' } });
}

export async function updateListing(id, data) {
  return notifyMutation(async () => {
    await requireUser();
    const record = await runQuery(supabase.from('listings').update(validateListing(data, { partial: true }))
      .eq('id', validateId(id, 'Listing ID')).select('*').maybeSingle(), 'Unable to update listing',
    { '23503': 'The selected category no longer exists.' });
    return requireRecord(record, 'Listing');
  }, { success: 'Listing updated successfully.', error: 'The listing could not be saved. Please try again.',
    errors: { '23503': 'The selected category no longer exists.' } });
}

export async function deleteListing(id) {
  return notifyMutation(async () => {
    await requireUser();
    let record;
    try {
      record = await runQuery(supabase.from('listings').delete().eq('id', validateId(id, 'Listing ID'))
        .select('id').maybeSingle(), 'Unable to delete listing');
    } catch(error) {
      if(error.code!=='PT409') throw error;
      const { invokeAdmin }=await import('./admin-service.js');
      await invokeAdmin('listing.delete',{id,confirm:id});
      record={id};
    }
    return requireRecord(record, 'Listing');
  }, { success: 'Listing deleted successfully.', error: 'The listing could not be deleted. Please try again.' });
}
