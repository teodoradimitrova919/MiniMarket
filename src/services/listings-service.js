import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { validateId, validateListing } from '../utils/validation.js';
import { requireRecord, runQuery } from '../utils/service-errors.js';

function listingsQuery(columns = '*') {
  return supabase.from('listings').select(columns)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
}

export async function getListings() {
  return getAllRows(listingsQuery, 'Unable to load listings');
}

export async function getLatestListings() {
  return runQuery(listingsQuery('*, category:categories(name)').limit(8), 'Unable to load latest listings');
}

export async function getListingById(id) {
  return runQuery(supabase.from('listings').select('*').eq('id', validateId(id, 'Listing ID')).maybeSingle(),
    'Unable to load listing');
}

export async function getMyListings() {
  const user = await requireUser();
  return getAllRows(() => listingsQuery().eq('owner_id', user.id), 'Unable to load your listings');
}

export async function createListing(data) {
  const user = await requireUser();
  const listing = { ...validateListing(data), owner_id: user.id };
  return runQuery(supabase.from('listings').insert(listing).select('*').single(), 'Unable to create listing',
    { '23503': 'The selected category no longer exists.' });
}

export async function updateListing(id, data) {
  await requireUser();
  const record = await runQuery(supabase.from('listings').update(validateListing(data, { partial: true }))
    .eq('id', validateId(id, 'Listing ID')).select('*').maybeSingle(), 'Unable to update listing',
  { '23503': 'The selected category no longer exists.' });
  return requireRecord(record, 'Listing');
}

export async function deleteListing(id) {
  await requireUser();
  const record = await runQuery(supabase.from('listings').delete().eq('id', validateId(id, 'Listing ID'))
    .select('id').maybeSingle(), 'Unable to delete listing');
  return requireRecord(record, 'Listing');
}
