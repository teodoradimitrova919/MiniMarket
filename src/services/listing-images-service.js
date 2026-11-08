import { supabase } from './supabase-client.js';
import { requireAdmin, invokeAdmin } from './admin-service.js';
import { getListingById } from './listings-service.js';
import { notifyMutation } from '../utils/operation-feedback.js';
import { runQuery, serviceError } from '../utils/service-errors.js';

export function uploadListingImage(id,file) {
  return notifyMutation(async()=>{
    await requireAdmin();
    const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    if(!file || !types[file.type] || file.size<1 || file.size>5242880) throw serviceError('Choose a JPEG, PNG, or WebP image up to 5 MB.','VALIDATION_ERROR');
    const listing=await getListingById(id);
    if(!listing) throw serviceError('This listing is unavailable.','NOT_FOUND_OR_FORBIDDEN');
    const key=`${listing.owner_id}/${id}/${crypto.randomUUID()}.${types[file.type]}`;
    await runQuery(supabase.storage.from('listing-images').upload(key,file,{contentType:file.type,upsert:false}),'Unable to upload image');
    try { return await invokeAdmin('images.attach',{id,key}); }
    catch(error) { await supabase.storage.from('listing-images').remove([key]).catch(()=>{}); throw error; }
  },{success:result=>result.cleanupPending ? 'Image saved; old image cleanup is pending.' : 'Product image uploaded successfully.',error:'The image could not be saved. Please try again.'});
}
export const removeListingImage = id => notifyMutation(()=>invokeAdmin('images.remove',{id}),{success:result=>result.cleanupPending ? 'Image removed; file cleanup is pending.' : 'Product image removed successfully.',error:'Image removal could not be completed. Please retry.'});
export const retryImageCleanup = id => notifyMutation(()=>invokeAdmin('images.cleanup',{id}),{success:result=>result.cleanupPending ? 'Image cleanup is still pending. Please retry.' : 'Unused image files removed.',error:'Image cleanup failed. Please retry.'});
