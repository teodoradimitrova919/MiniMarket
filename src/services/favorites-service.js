import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { validateId } from '../utils/validation.js';
import { runQuery } from '../utils/service-errors.js';

export async function getFavorites() {
  const user = await requireUser();
  const rows = await getAllRows(() => supabase.from('favorites').select('listing:listings(*)')
    .eq('user_id', user.id).order('created_at', { ascending: false }).order('id', { ascending: false }),
  'Unable to load favorites');
  return rows.map((row) => row.listing).filter(Boolean);
}

export async function addFavorite(listingId) {
  const user = await requireUser();
  return runQuery(supabase.from('favorites').insert({
    user_id: user.id,
    listing_id: validateId(listingId, 'Listing ID'),
  }).select('*').single(), 'Unable to save favorite', {
    '23505': 'This listing is already in your favorites.',
    '23503': 'This listing no longer exists.',
  });
}

export async function removeFavorite(listingId) {
  const user = await requireUser();
  const record = await runQuery(supabase.from('favorites').delete().eq('user_id', user.id)
    .eq('listing_id', validateId(listingId, 'Listing ID')).select('id').maybeSingle(),
  'Unable to remove favorite');
  return Boolean(record);
}

export async function isFavorite(listingId) {
  const user = await requireUser();
  const record = await runQuery(supabase.from('favorites').select('id').eq('user_id', user.id)
    .eq('listing_id', validateId(listingId, 'Listing ID')).maybeSingle(), 'Unable to check favorite');
  return Boolean(record);
}
