import { supabase } from './supabase-client.js';
import { getAllRows, requireUser } from './service-helpers.js';
import { validateId, validateText } from '../utils/validation.js';
import { requireRecord, runQuery } from '../utils/service-errors.js';
import { notifyMutation } from '../utils/operation-feedback.js';

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
  return notifyMutation(async () => {
    await requireUser();
    return runQuery(supabase.from('categories').insert({ name: validateText(name, 'Category name') })
      .select('*').single(), 'Unable to create category', categoryErrors);
  }, { success: 'Category created successfully.', error: 'The category could not be created. Please try again.', errors: categoryErrors });
}

export async function updateCategory(id, name) {
  return notifyMutation(async () => {
    await requireUser();
    const record = await runQuery(supabase.from('categories').update({ name: validateText(name, 'Category name') })
      .eq('id', validateId(id, 'Category ID')).select('*').maybeSingle(), 'Unable to update category', categoryErrors);
    return requireRecord(record, 'Category');
  }, { success: 'Category updated successfully.', error: 'The category could not be saved. Please try again.', errors: categoryErrors });
}

export async function deleteCategory(id) {
  return notifyMutation(async () => {
    await requireUser();
    const record = await runQuery(supabase.from('categories').delete().eq('id', validateId(id, 'Category ID'))
      .select('id').maybeSingle(), 'Unable to delete category', categoryErrors);
    return requireRecord(record, 'Category');
  }, { success: 'Category deleted successfully.', error: 'The category could not be deleted. Please try again.', errors: categoryErrors });
}
