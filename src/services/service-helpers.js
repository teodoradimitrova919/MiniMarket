import { supabase } from './supabase-client.js';
import { databaseError, runQuery, serviceError } from '../utils/service-errors.js';

export async function requireUser() {
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    throw databaseError(error, 'Unable to verify your session');
  }
  if (result.error && result.error.name !== 'AuthSessionMissingError') {
    throw databaseError(result.error, 'Unable to verify your session');
  }
  if (!result.data?.user) throw serviceError('Please sign in to continue.', 'AUTH_REQUIRED');
  return result.data.user;
}

// Page through the API instead of silently truncating list results at its row cap.
// Callers supply a stable order, including a unique ID to break timestamp ties.
export async function getAllRows(buildQuery, action) {
  const pageSize = 100;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await runQuery(buildQuery().range(offset, offset + pageSize - 1), action);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
