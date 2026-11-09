import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { populate, planListing, validateImage, validateSource } from './populate-listing-images.js';
import { prepareListingImageUpload } from '../src/utils/listing-image-upload.js';

const source = JSON.parse(await readFile(new URL('./listing-image-sources.json', import.meta.url)))[0];
assert.throws(() => validateSource({ ...source, downloadUrl: 'http://localhost/private' }));
assert.throws(() => validateSource({ ...source, license: 'All rights reserved' }));
assert.throws(() => validateImage(Buffer.from('%PDF'), 'application/pdf'));
assert.throws(() => validateImage(Buffer.alloc(5242881), 'image/jpeg'));
assert.throws(() => validateImage(Buffer.from('fake'), 'image/jpeg'));
assert.equal(validateImage(Buffer.from([255,216,255,1]), 'image/jpeg'), 'jpg');
const listing = { id:'5b651e52-6bba-4db3-ac81-fd87171b6ab5', owner_id:'049576a0-410c-48a1-877c-9e91845aeaa5', title:source.title, image_url:null, description:'Test', price:1, category_id:'category', created_at:'2026-01-01' };
assert.equal(planListing({ ...listing, image_url:'existing' }, [], [source]).action, 'existing');
assert.equal(planListing(listing, [{listing_id:listing.id,mime_type:'image/jpeg'}], [source]).action, 'existing');
assert.equal(planListing({...listing,title:'unknown'}, [], [source]).action, 'skip');
assert.match(prepareListingImageUpload(listing, new Blob(['data'], {type:'image/jpeg'})).path, new RegExp(`^${listing.owner_id}/${listing.id}/[0-9a-f-]+\\.jpg$`));

const directory = await mkdtemp(join(tmpdir(), 'minimarket-population-'));
const stateDirectory = pathToFileURL(directory + '/');
const catalogPath = new URL('catalog.json', stateDirectory), creditPath = new URL('credits.json', stateDirectory);
await writeFile(catalogPath, JSON.stringify([source]));
function fakeClient({ failUpdate = false, uncertainUpdate = false, failCleanup = false } = {}) {
  let row = {...listing}; const objects = new Set(); let uploaded=0, removed=0;
  const bucket = {
    getPublicUrl: path => ({data:{publicUrl:`https://example.test/listing-images/${path}`}}),
    upload: async path => {objects.add(path);uploaded++;return {error:null};},
    remove: async paths => {if(failCleanup)return {error:{}};paths.forEach(p=>objects.delete(p));removed++;return {error:null};},
    info: async () => ({data:{size:4}}),
  };
  const client = {
    storage:{from:()=>bucket,listBuckets:async()=>({data:[{name:'listing-images',public:true},{name:'listing-attachments',public:false}]})},
    from(table) {
      let update, single=false;
      const q={ select:()=>q, order:()=>q, range:()=>q, eq:()=>q, is:()=>q, update:data=>{update=data;return q;}, maybeSingle:()=>{single=true;return q;},
        then(resolve,reject) {try {
          if(table==='listing_attachments') return Promise.resolve({data:[]}).then(resolve,reject);
          if(update){if(!failUpdate)row={...row,...update};return Promise.resolve({data:failUpdate?null:[{id:row.id}],error:failUpdate||uncertainUpdate?{}:null}).then(resolve,reject);}
          return Promise.resolve({data:single?{...row}:[{...row}]}).then(resolve,reject);
        }catch(e){return Promise.reject(e).then(resolve,reject);}}
      }; return q;
    }
  };
  return {client, objects, counts:()=>({uploaded,removed}), row:()=>row, allowRecovery:()=>{failCleanup=false;failUpdate=false;}};
}
const download = async () => ({bytes:Buffer.from([255,216,255,1]),type:'image/jpeg',extension:'jpg',sha256:'test'});
const options = {apply:true,download,catalogPath,creditPath,stateDirectory};
try {
  const failed=fakeClient({failUpdate:true});
  assert.equal((await populate(failed.client, options)).failed,1);
  assert.equal(failed.objects.size,0,'Failed metadata association cleans the new orphan');
  assert.equal(failed.row().image_url,null);
  const pending=fakeClient({failUpdate:true,failCleanup:true});
  assert.equal((await populate(pending.client,options)).failed,1);
  assert.equal(pending.objects.size,1,'Failed cleanup retains the journal and object for retry');
  assert.equal(JSON.parse(await readFile(new URL('journal.json',stateDirectory))).length,1);
  pending.allowRecovery();
  assert.equal((await populate(pending.client,options)).populated,1);
  assert.equal(pending.objects.size,1,'Retry removes the orphan before creating the linked cover');
  assert.equal(JSON.parse(await readFile(new URL('journal.json',stateDirectory))).length,0);
  await writeFile(creditPath,'[]');
  const ambiguous=fakeClient({uncertainUpdate:true});
  assert.equal((await populate(ambiguous.client,options)).failed,1);
  assert.equal(ambiguous.objects.size,1,'Lost success response must not delete a linked cover');
  assert.equal((await populate(ambiguous.client,options)).populated,0,'Recovery preserves linked cover');
  assert.equal(ambiguous.counts().uploaded,1);
  await writeFile(creditPath,'[]');
  const success=fakeClient();
  assert.equal((await populate(success.client,{...options,apply:false})).planned,1);
  assert.equal(success.counts().uploaded,0,'Dry run never uploads');
  assert.equal((await populate(success.client,options)).populated,1);
  assert.equal((await populate(success.client,options)).populated,0);
  assert.equal(success.counts().uploaded,1,'Repeat run does not duplicate uploads');
  assert.equal(JSON.parse(await readFile(creditPath)).length,1);
  console.log('Image population: validation, dry run, compensation, uncertain response recovery and idempotence passed.');
} finally { await rm(directory,{recursive:true,force:true}); }
