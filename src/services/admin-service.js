import { supabase } from './supabase-client.js';
import { requireUser } from './service-helpers.js';
import { runQuery, serviceError } from '../utils/service-errors.js';
import { validateId } from '../utils/validation.js';
import { notifyMutation } from '../utils/operation-feedback.js';

export async function requireAdmin() {
  const user=await requireUser();
  const assignment=await runQuery(supabase.from('user_roles').select('role').eq('user_id',user.id).single(),'Unable to verify administrator access');
  if(assignment.role!=='admin') throw serviceError('Administrator access is required.','42501');
  return user;
}
const literal = value => value.replace(/[\\%_]/g, '\\$&');
export async function getAdminStats() { await requireAdmin(); return runQuery(supabase.rpc('admin_overview'),'Unable to load admin statistics'); }
export async function getAdminListings({page=1,search='',category=''}={}) {
  await requireAdmin();
  let query=supabase.from('listings').select('*, category:categories(name)',{count:'exact'}).order('created_at',{ascending:false}).order('id');
  if(search.trim()) query=query.ilike('title',`%${literal(search.trim())}%`);
  if(category) query=query.eq('category_id',validateId(category,'Category'));
  const response=await query.range((page-1)*20,page*20-1);
  const listings=await runQuery(Promise.resolve(response),'Unable to load admin listings');
  const ids=[...new Set(listings.map(listing=>listing.owner_id))];
  const owners=ids.length ? await runQuery(supabase.from('profiles').select('id,username').in('id',ids),'Unable to load listing owners') : [];
  const { decorateAttachmentThumbnails } = await import('./attachment-service.js');
  const thumbnails = await decorateAttachmentThumbnails(listings);
  return {rows:thumbnails.map(listing=>({...listing,owner:owners.find(owner=>owner.id===listing.owner_id)})),total:response.count};
}
export async function getAdminCategories({page=1,search=''}={}) {
  await requireAdmin();
  let query=supabase.from('categories').select('*, listings(count)',{count:'exact'}).order('name').order('id');
  if(search.trim()) query=query.ilike('name',`%${literal(search.trim())}%`);
  const response=await query.range((page-1)*20,page*20-1);
  const rows=await runQuery(Promise.resolve(response),'Unable to load admin categories');
  return {rows:rows.map(row=>({...row,listingCount:row.listings[0]?.count || 0})),total:response.count};
}
export async function invokeAdmin(action, fields={}) {
  await requireUser();
  const {data,error}=await supabase.functions.invoke('minimarket-admin',{body:{action,...fields}});
  if(error) {
    let message='The administrative request failed. Please try again.';
    try { const body=await error.context.json(); if(typeof body.error==='string') message=body.error; } catch { /* Gateway/network failures have no safe JSON message. */ }
    throw serviceError(message,'ADMIN_REQUEST_FAILED');
  }
  return data;
}
export const getAdminUsers = options => invokeAdmin('users.list',options);
export const getAdminUser = id => invokeAdmin('users.view',{id:validateId(id)});
export const getUserDeletionImpact = id => invokeAdmin('users.impact',{id:validateId(id)});
export const updateAdminUser = (id,patch) => notifyMutation(()=>invokeAdmin('users.update',{id:validateId(id),patch}),{success:'User updated successfully.',error:'The user could not be updated. Please try again.'});
export const deleteAdminUser = (id,email) => notifyMutation(()=>invokeAdmin('users.delete',{id:validateId(id),confirm:email}),{success:'User deleted successfully.',error:'User deletion could not be completed. Review the message and retry.'});
export const deleteAdminListing = id => notifyMutation(()=>invokeAdmin('listing.delete',{id:validateId(id),confirm:id}),{success:'Listing deleted successfully.',error:'Listing deletion could not be completed. Review the message and retry.'});
