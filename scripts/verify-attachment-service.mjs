import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule} from 'node:vm';
import {fileURLToPath} from 'node:url';
globalThis.window=new EventTarget();
const listingId='30000000-0000-4000-8000-000000000001';
let uploadError,metadataError,removeError,removed=0,uploaded=0,inserted=0,signCalls=0;
const client={
  auth:{async getUser(){return {data:{user:{id:'10000000-0000-4000-8000-000000000001'}}};}},
  storage:{from(){return {
    async upload(){uploaded++;return {data:{},error:uploadError};},
    async remove(){removed++;return {data:[],error:removeError};},
  };}},
  from(){let record;const q={insert(value){inserted++;record=value;return q;},select(){return q;},single(){return Promise.resolve({data:record,error:metadataError});}};return q;},
  functions:{async invoke(_name,{body}){signCalls++;return {data:{attachments:body.attachmentIds.map(id=>({id,url:'https://example.test/signed',expiresAt:new Date(0).toISOString()}))}};}},
};
const replacement=new SyntheticModule(['supabase'],function(){this.setExport('supabase',client);});
const modules=new Map();
async function load(url){
  if(url.endsWith('/supabase-client.js'))return replacement;
  if(!modules.has(url))modules.set(url,(async()=>{const m=new SourceTextModule(await readFile(fileURLToPath(url),'utf8'),{identifier:url});await m.link(s=>load(new URL(s,url).href));return m;})());
  return modules.get(url);
}
const module=await load(new URL('../src/services/attachment-service.js',import.meta.url).href);await module.evaluate();
const service=module.namespace,file={type:'image/png',name:'photo.png',size:10};
uploadError={code:'upload-failed',message:'test'};
await assert.rejects(service.uploadAttachment(listingId,file));assert.equal(inserted,0);assert.equal(removed,0);
uploadError=null;metadataError={code:'23514',message:'test'};
await assert.rejects(service.uploadAttachment(listingId,file));assert.equal(removed,1,'Failed registration compensates via Storage');
removeError={code:'cleanup-failed',message:'test'};
await assert.rejects(service.uploadAttachment(listingId,file),e=>e.code==='ATTACHMENT_CLEANUP_FAILED');
removeError=null;metadataError=null;
const record=await service.uploadAttachment(listingId,file);assert.equal(record.listing_id,listingId);assert.equal(record.uploaded_by,undefined);assert.ok(!record.storage_path.includes(file.name));
const before=uploaded;await assert.rejects(service.uploadAttachment(listingId,{...file,type:'text/html'}));assert.equal(uploaded,before,'Validation precedes network upload');
await Promise.all([service.getAttachmentUrl(record.id),service.getAttachmentUrl(record.id)]);assert.equal(signCalls,1,'Concurrent signing is deduplicated');
await service.getAttachmentUrl(record.id);assert.equal(signCalls,1,'Clock-skew-safe local cache reuses links');
await service.getAttachmentUrl(record.id,{force:true});assert.equal(signCalls,2);
console.log('PASS: attachment service upload failure, metadata compensation, cleanup failure reporting, validation before upload, generated paths, signing deduplication/cache/refresh.');
