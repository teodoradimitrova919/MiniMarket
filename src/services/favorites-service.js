import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { validateId } from '../utils/validation.js';
import { runQuery } from '../utils/service-errors.js';
import { notifyMutation } from '../utils/operation-feedback.js';

export async function getFavorites({ includeCategory = false } = {}) {
  const user = await requireUser();
  const rows = await getAllRows(() => supabase.from('favorites').select(includeCategory ? 'listing:listings(*,category:categories(name))' : 'listing:listings(*)')
    .eq('user_id', user.id).order('created_at', { ascending: false }).order('id', { ascending: false }),
  'Unable to load favorites');
  return rows.map((row) => row.listing).filter(Boolean);
}

export async function getUserFavorites() {
  const { decorateAttachmentThumbnails } = await import('./attachment-service.js');
  return decorateAttachmentThumbnails(await getFavorites({ includeCategory: true }));
}

export async function getFavoriteIds() {
  const user = await requireUser();
  const rows = await getAllRows(() => supabase.from('favorites').select('listing_id').eq('user_id', user.id).order('id'), 'Unable to load saved listings');
  return rows.map(row => row.listing_id);
}

export async function addFavorite(listingId) {
  return notifyMutation(async () => {
    const user = await requireUser();
    return runQuery(supabase.from('favorites').insert({
      user_id: user.id,
      listing_id: validateId(listingId, 'Listing ID'),
    }).select('*').single(), 'Unable to save favorite', {
      '23505': 'This listing is already in your favorites.',
      '23503': 'This listing no longer exists.',
    });
  }, { success: 'Listing added to favorites.', error: 'The listing could not be added to favorites. Please try again.',
    errors: { '23505': 'This listing is already in your favorites.', '23503': 'This listing no longer exists.' } });
}

export async function removeFavorite(listingId) {
  return notifyMutation(async () => {
    const user = await requireUser();
    const record = await runQuery(supabase.from('favorites').delete().eq('user_id', user.id)
      .eq('listing_id', validateId(listingId, 'Listing ID')).select('id').maybeSingle(),
    'Unable to remove favorite');
    return Boolean(record);
  }, { success: (removed) => removed ? 'Listing removed from favorites.' : null,
    error: 'The listing could not be removed from favorites. Please try again.' });
}

export async function isFavorite(listingId) {
  const user = await requireUser();
  const record = await runQuery(supabase.from('favorites').select('id').eq('user_id', user.id)
    .eq('listing_id', validateId(listingId, 'Listing ID')).maybeSingle(), 'Unable to check favorite');
  return Boolean(record);
}
