// Live verification against marked temporary fixtures only. Never print credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {readConfig} from './seed.js';
import {validateAttachmentFile} from '../src/utils/attachment-validation.js';
import {createAttachmentUrlHandler} from '../supabase/functions/listing-attachment-urls/handler.js';
import {createAdminHandler} from '../supabase/functions/minimarket-admin/handler.js';

const config=readConfig(parseEnv(await readFile('.env.seed.local','utf8')));
const env=parseEnv(await readFile('.env.local','utf8'));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const privileged=createClient(config.url,config.key,options);
const client=()=>createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const anon=client(),users=[],listingIds=[];
const check=(r,label)=>{if(r.error)throw new Error(`${label} failed (${r.error.code||r.error.context?.status||'request'}).`);return r.data;};
const bucket='listing-attachments';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBFkAAAAASUVORK5CYII=','base64');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF');
const files=[];
async function upload(c,id,type='image/png',name='same-name.png',uploadedBy){
  const attachmentId=randomUUID(),path=`${id}/${attachmentId}.${type==='application/pdf'?'pdf':'png'}`;
  check(await c.storage.from(bucket).upload(path,type==='application/pdf'?pdf:png,{contentType:type}),'Upload');
  files.push(path);
  return check(await c.from('listing_attachments').insert({id:attachmentId,listing_id:id,storage_path:path,original_filename:name,mime_type:type,size_bytes:1,...(uploadedBy?{uploaded_by:uploadedBy}:{})}).select().single(),'Metadata');
}
async function sign(c,ids,download=false){return check(await c.functions.invoke('listing-attachment-urls',{body:{attachmentIds:ids,download}}),'Signed URL endpoint').attachments;}
try{
  assert.throws(()=>validateAttachmentFile({type:'text/html',name:'bad.html',size:10}));
  assert.throws(()=>validateAttachmentFile({type:'image/png',name:'big.png',size:5242881}));
  const b=check(await privileged.storage.getBucket(bucket),'Bucket');
  assert.equal(b.public,false);assert.equal(b.file_size_limit,5242880);
  for(const label of ['owner','other','admin']){
    const email=`attachments-${randomUUID()}@test.com`,password=randomUUID();
    const user=check(await privileged.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:`Attachment verification ${label}`}}),'Fixture user').user;
    const c=client();users.push({...user,password,client:c});
    check(await c.auth.signInWithPassword({email,password}),'Fixture login');
  }
  const [owner,other,admin]=users;
  check(await privileged.from('user_roles').update({role:'admin'}).eq('user_id',admin.id),'Fixture promotion');
  const category=check(await anon.from('categories').select('id').limit(1),'Category')[0];
  const listing=check(await owner.client.from('listings').insert({owner_id:owner.id,category_id:category.id,title:'Attachment verification '+randomUUID(),price:1}).select().single(),'Fixture listing');
  listingIds.push(listing.id);
  const image=await upload(owner.client,listing.id,'image/png','same-name.png',other.id),doc=await upload(owner.client,listing.id,'application/pdf','manual.pdf');
  assert.equal(image.uploaded_by,owner.id);assert.equal(image.size_bytes,png.length,'Storage controls size');
  const duplicate=await upload(owner.client,listing.id);assert.notEqual(image.storage_path,duplicate.storage_path);
  const adminImage=await upload(admin.client,listing.id);assert.equal(adminImage.uploaded_by,admin.id);
  assert.equal(check(await anon.from('listing_attachments').select().eq('listing_id',listing.id),'Public metadata').length,4);
  const signed=await sign(anon,[image.id,doc.id]);assert.equal(signed.length,2);
  const claims=JSON.parse(Buffer.from(new URL(signed[0].url).searchParams.get('token').split('.')[1],'base64url'));
  assert.ok(claims.exp-claims.iat<=300,'Signed capability lasts at most five minutes');
  assert.equal((await fetch(signed[0].url)).status,200);
  const downloads=await sign(anon,[doc.id],true);assert.equal((await fetch(downloads[0].url)).status,200);
  assert.match(new URL(downloads[0].url).searchParams.get('download'),/manual.pdf/);
  assert.notEqual((await fetch(`${config.url}/storage/v1/object/public/${bucket}/${image.storage_path}`)).status,200);
  for(const c of [anon,other.client]){
    assert.ok((await c.storage.from(bucket).upload(`${listing.id}/${randomUUID()}.png`,png,{contentType:'image/png'})).error);
    assert.ok((await c.rpc('begin_attachment_deletion',{target:image.id})).error);
    const deletion=await c.from('listing_attachments').delete().eq('id',image.id).select();
    assert.ok(deletion.error||!deletion.data.length);
    await c.storage.from(bucket).remove([image.storage_path]);
    assert.equal((await fetch((await sign(anon,[image.id]))[0].url)).status,200);
  }
  assert.ok((await owner.client.from('listing_attachments').delete().eq('id',image.id)).error,'Metadata cannot orphan Storage');
  assert.ok((await owner.client.from('listings').delete().eq('id',listing.id)).error,'Listing cannot orphan Storage');
  assert.ok((await owner.client.storage.from(bucket).upload(`${listing.id}/${randomUUID()}.html`,Buffer.from('bad'),{contentType:'text/html'})).error);
  assert.ok((await owner.client.storage.from(bucket).upload(`${listing.id}/${randomUUID()}.png`,new Uint8Array(5242881),{contentType:'image/png'})).error);
  assert.ok((await owner.client.storage.from(bucket).upload(`../${randomUUID()}.png`,png,{contentType:'image/png'})).error);
  await upload(owner.client,listing.id);
  const overflowId=randomUUID(),overflowPath=`${listing.id}/${overflowId}.png`;
  check(await owner.client.storage.from(bucket).upload(overflowPath,png,{contentType:'image/png'}),'Overflow upload');files.push(overflowPath);
  assert.ok((await owner.client.from('listing_attachments').insert({id:overflowId,listing_id:listing.id,storage_path:overflowPath,original_filename:'overflow.png',mime_type:'image/png',size_bytes:png.length})).error);
  check(await owner.client.storage.from(bucket).remove([overflowPath]),'Unregistered cleanup');
  // Retry a metadata failure after the object was already removed.
  check(await owner.client.rpc('begin_attachment_deletion',{target:image.id}),'Begin removal');
  check(await owner.client.storage.from(bucket).remove([image.storage_path]),'Remove object');
  check(await owner.client.storage.from(bucket).remove([image.storage_path]),'Retry missing object');
  check(await owner.client.from('listing_attachments').delete().eq('id',image.id),'Remove metadata');
  assert.equal((await sign(anon,[image.id])).length,0);
  // Inject Storage failure into the real server handler; reservation must preserve the listing.
  const session=check(await owner.client.auth.getSession(),'Session').session;
  const brokenAdmin={auth:privileged.auth,storage:{from(){return {async list(){return {error:{code:'injected'}};}};}}};
  const handler=createAdminHandler({admin:brokenAdmin,caller:()=>owner.client,url:config.url,origins:[]});
  const failed=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'listing.delete',id:listing.id,confirm:listing.id})}));
  assert.equal(failed.status,409);
  assert.ok(check(await privileged.from('listings').select('id').eq('id',listing.id).single(),'Preserved listing'));
  assert.ok((await owner.client.storage.from(bucket).upload(`${listing.id}/${randomUUID()}.png`,png,{contentType:'image/png'})).error,'Pending deletion freezes upload');
  check(await owner.client.functions.invoke('minimarket-admin',{body:{action:'listing.delete',id:listing.id,confirm:listing.id}}),'Retry listing deletion');
  assert.equal(check(await privileged.storage.from(bucket).list(listing.id),'Clean folder').length,0);
  assert.equal(check(await anon.from('listing_attachments').select().eq('listing_id',listing.id),'Clean metadata').length,0);
  // Unit check public signer does not sign arbitrary paths and reports a signing failure.
  const badSigner=createAttachmentUrlHandler({publicClient:anon,admin:privileged,origins:[]});
  assert.equal((await badSigner(new Request('https://example.test',{method:'POST',body:JSON.stringify({attachmentIds:[doc.id],path:'arbitrary'})}))).status,400);
  const accountListing=check(await other.client.from('listings').insert({owner_id:other.id,category_id:category.id,title:'Attachment account cleanup '+randomUUID(),price:1}).select().single(),'Account cleanup listing');
  listingIds.push(accountListing.id);
  await upload(other.client,accountListing.id,'application/pdf','account.pdf');
  check(await admin.client.functions.invoke('minimarket-admin',{body:{action:'users.delete',id:other.id,confirm:other.email}}),'Auth-last attachment cleanup');
  users.splice(users.indexOf(other),1);
  assert.equal(check(await privileged.storage.from(bucket).list(accountListing.id),'Account cleaned folder').length,0);
  assert.equal(check(await anon.from('listing_attachments').select().eq('listing_id',accountListing.id),'Account cleaned metadata').length,0);
  console.log('PASS: private bucket, owner/admin uploads, public signed downloads, authoritative metadata, image limits, duplicate filenames, MIME/size/path rejection, anonymous/non-owner denial, metadata guards, deletion failure and retry, Storage cleanup.');
}finally{
  for(const id of listingIds){
    const objects=check(await privileged.storage.from(bucket).list(id,{limit:100}),'Fixture cleanup listing');
    if(objects.length)check(await privileged.storage.from(bucket).remove(objects.map(o=>`${id}/${o.name}`)),'Fixture Storage cleanup');
    check(await privileged.from('listings').delete().eq('id',id),'Fixture listing cleanup');
  }
  for(const user of users)check(await privileged.auth.admin.deleteUser(user.id),'Fixture user cleanup');
}
