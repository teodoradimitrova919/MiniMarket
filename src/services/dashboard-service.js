import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { runQuery, serviceError } from '../utils/service-errors.js';

async function exactCount(query) {
  const count = await runQuery(query.then(({ count, error }) => ({ data: count, error })),
    'Unable to load dashboard statistics');
  if (!Number.isSafeInteger(count) || count < 0) {
    throw serviceError('The dashboard count could not be verified. Please try again.', 'REQUEST_FAILED');
  }
  return count;
}

export async function getDashboardStats() {
  const user = await requireUser();
  // Explicit ownership filters are required even though listings are public and
  // administrators may read all listings. RLS remains the authorization boundary.
  const [totalListings, totalFavorites, categoryRows] = await Promise.all([
    exactCount(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)),
    exactCount(supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id)),
    getAllRows(() => supabase.from('listings').select('id, category_id')
      .eq('owner_id', user.id).order('id'), 'Unable to load categories used'),
  ]);
  return { totalListings, totalFavorites, totalCategoriesUsed: new Set(categoryRows.map((row) => row.category_id)).size };
}
