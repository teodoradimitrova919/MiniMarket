import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { validateId, validateText } from '../utils/validation.js';
import { requireRecord, runQuery } from '../utils/service-errors.js';

const categoryErrors = {
  '23505': 'A category with this name already exists.',
  '23503': 'This category is still used by listings. Reassign or remove those listings first.',
};

export async function getCategories() {
  return getAllRows(() => supabase.from('categories').select('*').order('name').order('id'),
    'Unable to load categories');
}

// Authentication is checked here; administrator authorization remains in RLS.
export async function createCategory(name) {
  await requireUser();
  return runQuery(supabase.from('categories').insert({ name: validateText(name, 'Category name') })
    .select('*').single(), 'Unable to create category', categoryErrors);
}

export async function updateCategory(id, name) {
  await requireUser();
  const record = await runQuery(supabase.from('categories').update({ name: validateText(name, 'Category name') })
    .eq('id', validateId(id, 'Category ID')).select('*').maybeSingle(), 'Unable to update category', categoryErrors);
  return requireRecord(record, 'Category');
}

export async function deleteCategory(id) {
  await requireUser();
  const record = await runQuery(supabase.from('categories').delete().eq('id', validateId(id, 'Category ID'))
    .select('id').maybeSingle(), 'Unable to delete category', categoryErrors);
  return requireRecord(record, 'Category');
}
