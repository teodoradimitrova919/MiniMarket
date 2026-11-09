import {supabase} from './supabase-client.js';
import {getAllRows,requireUser} from './service-helpers.js';
import {runQuery,serviceError} from '../utils/service-errors.js';
import {validateId} from '../utils/validation.js';
import {ATTACHMENT_BUCKET,validateAttachmentFile} from '../utils/attachment-validation.js';
import {notifyMutation} from '../utils/operation-feedback.js';

const urls=new Map(),inFlight=new Map();
const canonical=id=>validateId(id,'Attachment or listing ID').toLowerCase();
function forget(id){urls.delete(id);urls.delete(`${id}:download`);}
export async function getListingAttachments(listingId){
  const id=canonical(listingId);
  return getAllRows(()=>supabase.from('listing_attachments').select('*').eq('listing_id',id).order('created_at').order('id'),'Unable to load listing attachments');
}
export async function getAttachmentUrls(attachmentIds,{download=false,force=false}={}){
  const ids=[...new Set(attachmentIds.map(canonical))];
  const result=new Map(),missing=[];
  const key=id=>download?`${id}:download`:id;
  for(const id of ids){const cached=urls.get(key(id));if(!force&&cached?.expiresAt>Date.now()+15000)result.set(id,cached.url);else{urls.delete(key(id));missing.push(id);}}
  for(let offset=0;offset<missing.length;offset+=50){
    const batch=missing.slice(offset,offset+50),requestKey=JSON.stringify([download,...batch]);
    let request=inFlight.get(requestKey);
    if(!request){
      request=(async()=>{
        const response=await supabase.functions.invoke('listing-attachment-urls',{body:{attachmentIds:batch,download}});
        if(response.error)throw serviceError('File links could not be loaded. Please try again.','ATTACHMENT_URL_FAILED');
        for(const item of response.data.attachments||[]){
          if(item.url&&batch.includes(item.id))urls.set(key(item.id),{url:item.url,expiresAt:Date.now()+285000});
        }
      })();
      inFlight.set(requestKey,request);
    }
    try{await request;}finally{if(inFlight.get(requestKey)===request)inFlight.delete(requestKey);}
    for(const id of batch){const cached=urls.get(key(id));if(cached?.expiresAt>Date.now())result.set(id,cached.url);}
  }
  if(urls.size>1000)for(const [id,item] of urls)if(item.expiresAt<Date.now())urls.delete(id);
  return result;
}
export async function getAttachmentUrl(attachmentId,options){
  const id=canonical(attachmentId),result=await getAttachmentUrls([id],options);
  if(!result.has(id))throw serviceError('This file is missing or no longer available.','ATTACHMENT_UNAVAILABLE');
  return result.get(id);
}
export function uploadAttachment(listingId,file){
  return notifyMutation(async()=>{
    const id=canonical(listingId),info=validateAttachmentFile(file);
    await requireUser();
    const attachmentId=crypto.randomUUID(),path=`${id}/${attachmentId}.${info.extension}`;
    await runQuery(supabase.storage.from(ATTACHMENT_BUCKET).upload(path,file,{contentType:info.type,upsert:false}),'Unable to upload attachment');
    try{
      return await runQuery(supabase.from('listing_attachments').insert({id:attachmentId,listing_id:id,storage_path:path,original_filename:info.name,mime_type:info.type,size_bytes:info.size}).select('*').single(),'Unable to register attachment',{'23514':'A listing allows up to five attachments total, each no larger than 5 MB.'});
    }catch(error){
      try{await runQuery(supabase.storage.from(ATTACHMENT_BUCKET).remove([path]),'Unable to remove unregistered upload');}
      catch{throw serviceError('The upload could not be registered and file cleanup failed. Use Retry file cleanup, or retry after reloading the editor.','ATTACHMENT_CLEANUP_FAILED');}
      throw error;
    }
  },{success:'Attachment uploaded successfully.',error:'The attachment could not be uploaded. Please try again.',errors:{ATTACHMENT_CLEANUP_FAILED:'Upload registration and file cleanup failed. Use Retry file cleanup.'}});
}
export function deleteAttachment(attachmentId){
  return notifyMutation(async()=>{
    const id=canonical(attachmentId);await requireUser();
    const attachment=await runQuery(supabase.from('listing_attachments').select('*').eq('id',id).maybeSingle(),'Unable to load attachment');
    if(!attachment)return {id,alreadyDeleted:true};
    await runQuery(supabase.rpc('begin_attachment_deletion',{target:id}),'Unable to authorize attachment removal');
    await runQuery(supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]),'Unable to remove attachment file');
    try{await runQuery(supabase.from('listing_attachments').delete().eq('id',id).select('id').maybeSingle(),'Unable to remove attachment metadata');}
    catch{forget(id);throw serviceError('The file was removed, but its record could not be cleared. Retry removal.','ATTACHMENT_METADATA_DELETE_FAILED');}
    forget(id);return {id};
  },{success:'Attachment removed successfully.',error:'The attachment could not be removed. Please try again.',errors:{ATTACHMENT_METADATA_DELETE_FAILED:'The file was removed, but record cleanup failed. Retry removal.'}});
}
export async function cleanupUnregisteredAttachments(listingId){
  const id=canonical(listingId);await requireUser();
  const records=await getListingAttachments(id),registered=new Set(records.map(row=>row.storage_path));
  const paths=[];
  for(let offset=0;;offset+=100){
    const files=await runQuery(supabase.storage.from(ATTACHMENT_BUCKET).list(id,{limit:100,offset,sortBy:{column:'name',order:'asc'}}),'Unable to inspect attachment cleanup');
    for(const file of files)if(file.id&&!registered.has(`${id}/${file.name}`))paths.push(`${id}/${file.name}`);
    if(files.length<100)break;
  }
  // Storage RLS rechecks that each object is still unregistered before removal.
  let removed=0;
  for(let offset=0;offset<paths.length;offset+=100){const result=await runQuery(supabase.storage.from(ATTACHMENT_BUCKET).remove(paths.slice(offset,offset+100)),'File cleanup failed. Please retry');removed+=result?.length||0;}
  return removed;
}
export async function decorateAttachmentThumbnails(listings){
  if(!listings.length)return listings;
  try{
    const attachments=[];
    for(let offset=0;offset<listings.length;offset+=50){
      const ids=listings.slice(offset,offset+50).map(listing=>listing.id);
      attachments.push(...await getAllRows(()=>supabase.from('listing_attachments').select('id,listing_id,mime_type,created_at').in('listing_id',ids).order('created_at').order('id'),'Unable to load listing thumbnails'));
    }
    const firstImages=listings.map(listing=>attachments.find(row=>row.listing_id===listing.id&&row.mime_type?.startsWith('image/')));
    const signed=await getAttachmentUrls(firstImages.filter(Boolean).map(row=>row.id));
    return listings.map((listing,index)=>({...listing,attachment_image_id:firstImages[index]?.id,attachment_image_url:signed.get(firstImages[index]?.id)}));
  }catch{return listings;} // A thumbnail or rollout failure must not hide readable listings.
}
