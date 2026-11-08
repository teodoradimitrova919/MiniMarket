// Live API/browser verification. Only marked temporary users and their records are mutated.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {readConfig} from './seed.js';
import {createAdminHandler} from '../supabase/functions/minimarket-admin/handler.js';
const config=readConfig(parseEnv(await readFile('.env.seed.local','utf8')));
const env=parseEnv(await readFile('.env.local','utf8'));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const privileged=createClient(config.url,config.key,options);
const makeClient=()=>createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const admin=makeClient(),anon=makeClient(),fixtures=[];
const endpoint=`${config.url}/functions/v1/minimarket-admin`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBFkAAAAASUVORK5CYII=','base64');
const prefix=`Admin verification ${randomUUID()}`;
let category,browser;
const check=(response,label)=>{if(response.error)throw new Error(`${label} failed (${response.error.code || response.error.context?.status || 'request'}).`);return response.data;};
async function signIn(client,user){return check(await client.auth.signInWithPassword({email:user.email,password:user.password}),'Signing in verification user');}
async function invoke(client,action,fields={}){const response=await client.functions.invoke('minimarket-admin',{body:{action,...fields}});return check(response,action);}
async function denied(client,action,fields={}){const response=await client.functions.invoke('minimarket-admin',{body:{action,...fields}});assert.ok(response.error,`${action} must be denied`);return response;}
async function deleteStorage(prefix){
  for(;;){
    const rows=check(await privileged.storage.from('listing-images').list(prefix,{limit:100}),'Listing fixture images');
    if(!rows.length)return;
    for(const row of rows){if(row.id)check(await privileged.storage.from('listing-images').remove([`${prefix}/${row.name}`]),'Removing fixture image');else await deleteStorage(`${prefix}/${row.name}`);}
  }
}
try{
  for(const name of ['Owner','Other']){
    const email=`admin-test-${randomUUID()}@test.com`,password=randomUUID();
    const data=check(await privileged.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:`${prefix} ${name}`,role:'admin'},app_metadata:{minimarket_admin_test:true}}),'Creating marked fixture');
    fixtures.push({id:data.user.id,email,password,client:makeClient()});
  }
  const [owner,other]=fixtures;
  await signIn(owner.client,owner);await signIn(other.client,other);
  await signIn(admin,{email:'admin@admin.com',password:'pass123'});
  const adminSession=check(await admin.auth.getSession(),'Reading administrator session').session;
  const adminId=adminSession.user.id;
  for(const user of fixtures){
    const role=check(await user.client.from('user_roles').select('*'),'Reading own role');
    assert.equal(role.length,1);assert.equal(role[0].user_id,user.id);assert.equal(role[0].role,'user','Signup metadata cannot grant admin');
    assert.ok((await user.client.from('user_roles').update({role:'admin'}).eq('user_id',user.id)).error);
    assert.ok((await user.client.rpc('admin_set_role',{target:user.id,desired:'admin'})).error);
    assert.ok((await user.client.from('profiles').update({role:'admin'}).eq('id',user.id)).error);
    assert.ok((await user.client.rpc('admin_overview')).error);
  }
  assert.ok((await anon.from('user_roles').select('*')).error);
  assert.ok((await anon.from('profiles').select('*')).error);
  assert.ok(check(await anon.from('listings').select('id').limit(1),'Public listings').length);
  assert.ok(check(await anon.from('categories').select('id').limit(1),'Public categories').length);
  await denied(anon,'users.list');await denied(owner.client,'users.list');
  assert.ok((await admin.rpc('admin_set_role',{target:adminId,desired:'user'})).error,'Last admin cannot be demoted');
  await denied(admin,'users.delete',{id:adminId,confirm:'admin@admin.com'});
  const forbidden=await fetch(endpoint,{method:'POST',headers:{origin:'https://untrusted.example',authorization:`Bearer ${adminSession.access_token}`,apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({action:'users.list'})});
  assert.equal(forbidden.status,403);
  const cors=await fetch(endpoint,{method:'OPTIONS',headers:{origin:'http://127.0.0.1:5180','access-control-request-method':'POST'}});
  assert.equal(cors.status,204);assert.equal(cors.headers.get('access-control-allow-origin'),'http://127.0.0.1:5180');
  const users=await invoke(admin,'users.list',{page:1,pageSize:1,search:''});
  assert.equal(users.users.length,1);
  assert.equal(users.total,check(await privileged.auth.admin.listUsers({page:1,perPage:1000}),'Counting current Auth users').users.length);
  assert.deepEqual(Object.keys(users.users[0]).sort(),['created_at','deletionPending','email','id','listingCount','role','username'].sort());
  const search=await invoke(admin,'users.list',{page:1,pageSize:20,search:other.email});assert.equal(search.total,1);
  await denied(admin,'users.update',{id:other.id,patch:{role:'admin'}});
  await denied(admin,'users.update',{id:other.id,patch:{email:'invalid'}});
  console.log('PASS: default/backfilled roles, signup-metadata rejection, direct escalation denial, private-data guards, last-admin protection, CORS, user pagination/search, and response allowlist.');

  category=check(await admin.from('categories').insert({name:prefix}).select('*').single(),'Creating temporary category');
  assert.ok((await owner.client.from('categories').insert({name:`${prefix} forbidden`})).error);
  assert.ok((await admin.from('categories').insert({name:prefix})).error,'Duplicate category rejected');
  const listing=check(await owner.client.from('listings').insert({owner_id:owner.id,category_id:category.id,title:`${prefix} Owner item`,description:'Plain text <script>not executable</script>',price:12}).select('*').single(),'Creating owned fixture');
  check(await other.client.from('favorites').insert({user_id:other.id,listing_id:listing.id}),'Creating dependent favorite');
  assert.ok((await admin.from('categories').delete().eq('id',category.id)).error,'In-use category is protected');
  const nonOwner=await other.client.from('listings').update({title:'Forbidden'}).eq('id',listing.id).select('id');assert.ok(nonOwner.error||!nonOwner.data.length);
  check(await admin.from('listings').update({price:14}).eq('id',listing.id),'Admin cross-owner edit');
  assert.equal(check(await privileged.from('listings').select('owner_id').eq('id',listing.id).single(),'Owner invariant').owner_id,owner.id);
  assert.ok((await admin.from('listings').update({owner_id:other.id}).eq('id',listing.id)).error);
  const key=`${owner.id}/${listing.id}/${randomUUID()}.png`;
  assert.ok((await other.client.storage.from('listing-images').upload(key,png,{contentType:'image/png'})).error,'Other user cannot upload into owner path');
  check(await owner.client.storage.from('listing-images').upload(key,png,{contentType:'image/png'}),'Owner image upload');
  await invoke(admin,'images.attach',{id:listing.id,key});
  const imageUrl=`${config.url}/storage/v1/object/public/listing-images/${key}`;
  assert.equal((await fetch(imageUrl)).status,200,'Public image is readable');
  assert.ok((await owner.client.from('listings').delete().eq('id',listing.id)).error,'Direct image-bearing delete cannot orphan Storage');
  const tokenClient=token=>createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});
  // Inject one Storage failure into the actual handler; keep real Auth/RPC/DB calls.
  const broken=new Proxy(privileged,{get(target,key){if(key==='storage')return{from(bucket){const real=target.storage.from(bucket);return{list:real.list.bind(real),remove:async()=>({data:null,error:{code:'controlled_failure'}})};}};return Reflect.get(target,key);}});
  const handler=createAdminHandler({admin:broken,caller:tokenClient,url:config.url,origins:[]});
  const local=action=>new Request(endpoint,{method:'POST',headers:{authorization:`Bearer ${adminSession.access_token}`,'content-type':'application/json'},body:JSON.stringify(action)});
  const failed=await handler(local({action:'listing.delete',id:listing.id,confirm:listing.id}));assert.equal(failed.status,409);
  assert.ok(check(await privileged.from('listings').select('id').eq('id',listing.id).single(),'Failed cleanup preserves listing'));
  const frozen=await owner.client.from('listings').update({price:99}).eq('id',listing.id).select('id');assert.ok(frozen.error||!frozen.data.length);
  await invoke(admin,'listing.delete',{id:listing.id,confirm:listing.id});
  assert.equal(check(await privileged.from('favorites').select('id').eq('listing_id',listing.id),'Favorite cascade').length,0);
  assert.equal(check(await privileged.storage.from('listing-images').list(`${owner.id}/${listing.id}`),'Deleted listing image folder').length,0);
  console.log('PASS: admin/owner listing permissions, category FK and duplicate constraints, image RLS/public reads, owner invariants, failed cleanup freeze, retry, and favorites cascade.');

  const owned=check(await owner.client.from('listings').insert({owner_id:owner.id,category_id:category.id,title:`prefix Owner cleanup`,price:5}).select('*').single(),'Creating user cleanup fixture');
  const ownedKey=`${owner.id}/${owned.id}/${randomUUID()}.png`;
  check(await owner.client.storage.from('listing-images').upload(ownedKey,png,{contentType:'image/png'}),'Uploading cleanup fixture');
  await invoke(admin,'images.attach',{id:owned.id,key:ownedKey});
  const impact=await invoke(admin,'users.impact',{id:owner.id});assert.equal(impact.impact.listings,1);assert.equal(impact.impact.images,1);
  const failure=await handler(local({action:'users.delete',id:owner.id,confirm:owner.email}));assert.equal(failure.status,409);
  assert.ok(check(await privileged.auth.admin.getUserById(owner.id),'Pending Auth account preserved').user);
  assert.equal((await invoke(admin,'users.impact',{id:owner.id})).impact.deletionPending,true);
  await invoke(admin,'users.delete',{id:owner.id,confirm:owner.email});
  assert.ok((await privileged.auth.admin.getUserById(owner.id)).error);
  assert.equal(check(await privileged.from('listings').select('id').eq('owner_id',owner.id),'User listing cleanup').length,0);
  const newEmail=`admin-test-updated-${randomUUID()}@test.com`;
  await invoke(admin,'users.update',{id:other.id,patch:{username:`${prefix} Edited`,email:newEmail}});other.email=newEmail;
  const edited=await invoke(admin,'users.view',{id:other.id});assert.equal(edited.user.email,newEmail);assert.equal(edited.user.username,`${prefix} Edited`);assert.equal(edited.user.role,'user');
  console.log('PASS: deletion impact, partial user cleanup preservation/freeze, retryable Auth-last deletion, and validated display-name/email edits without role changes.');

  // Ensure real admin listings pagination spans more than one API page.
  const listingRows=check(await other.client.from('listings').insert(Array.from({length:4},(_,i)=>({owner_id:other.id,category_id:category.id,title:`${prefix} Item ${i}`,price:20+i}))).select('*'),'Creating UI fixtures');
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),base=process.env.ADMIN_TEST_URL||'http://127.0.0.1:5180',errors=[];
  page.on('pageerror',error=>errors.push(error.message));let acceptDiscard=false;
  page.on('dialog',dialog=>dialog[acceptDiscard?'accept':'dismiss']());
  const ready=()=>page.locator('[data-admin-table]:not([hidden])').waitFor();
  const recordDialog=()=>page.locator('.admin-dialog');
  async function loginUI(user){
    await page.goto(`${base}/login`);await page.waitForFunction(()=>location.pathname!=='/login'||document.querySelector('form[aria-label="Login"]'));
    if(new URL(page.url()).pathname!=='/login'){await page.locator('[data-logout]').click();await page.waitForURL(url=>url.pathname==='/');await page.goto(`${base}/login`);}
    await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Login',exact:true}).click();await page.waitForURL(url=>url.pathname==='/dashboard');
  }
  await page.goto(`${base}/admin/users`);await page.waitForURL(url=>url.pathname==='/login');
  await loginUI(other);assert.equal(await page.locator('header a[href="/admin"]').isVisible(),false);
  await page.goto(`${base}/admin/categories`);await page.waitForURL(url=>url.pathname==='/my-listings');
  await loginUI({email:'admin@admin.com',password:'pass123'});
  await page.getByRole('link',{name:'Admin Panel',exact:true}).click();await page.locator('[data-admin-stats]:not([hidden])').waitFor();
  assert.equal(Number(await page.locator('[data-total-listings]').textContent()),22);
  await page.locator('.admin-nav a[href="/admin/listings"]').click();await ready();
  assert.equal(await page.locator('tbody tr').count(),20);
  await page.getByRole('button',{name:'Next',exact:true}).click();await ready();assert.equal(await page.locator('tbody tr').count(),2);
  await page.getByLabel('Search by title',{exact:true}).fill(prefix);await page.locator('form').getByRole('button',{name:'Search',exact:true}).click();await ready();assert.equal(await page.locator('tbody tr').count(),4);
  const chosen=listingRows[0],row=()=>page.locator(`tr[data-admin-listing-id="${chosen.id}"]`);
  await row().getByRole('button',{name:'View',exact:true}).click();await page.locator('[data-details-content]:not([hidden])').waitFor();await page.keyboard.press('Escape');
  await row().getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#listing-form-modal [data-listing-form]:not([hidden])').waitFor();
  await page.locator('#listing-price').fill('31');await page.locator('[data-save-listing]').click();await ready();
  await page.locator('#listing-form-modal').waitFor({state:'hidden'});await ready();
  assert.match(await row().textContent(),/31.00/);
  await row().getByRole('button',{name:'Image',exact:true}).click();
  await recordDialog().locator('input[type="file"]').setInputFiles({name:'demo.png',mimeType:'image/png',buffer:png});
  await recordDialog().getByRole('button',{name:'Upload image',exact:true}).click();
  await recordDialog().getByText('The image change and file cleanup are complete.',{exact:true}).waitFor();
  await ready();
  await recordDialog().getByRole('button',{name:'Remove current image',exact:true}).click();
  assert.equal(await row().locator('img').count(),1,'Canceling image removal does not mutate the listing');
  acceptDiscard=true;
  const removedImage=page.waitForResponse(response=>response.url().includes('/functions/v1/minimarket-admin')&&response.request().postDataJSON()?.action==='images.remove');
  await recordDialog().getByRole('button',{name:'Remove current image',exact:true}).click();await removedImage;
  acceptDiscard=false;
  await page.waitForFunction(id=>!document.querySelector(`tr[data-admin-listing-id="${id}"] img`),chosen.id);await ready();
  await recordDialog().getByRole('button',{name:'Cancel',exact:true}).click();
  await row().getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#delete-listing-modal').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.ok(await row().count());
  await page.locator('.admin-nav a[href="/admin/categories"]').click();await ready();
  await page.locator(`tr[data-category-id="${category.id}"]`).getByRole('button',{name:'Delete',exact:true}).click();await recordDialog().getByText('Category is in use',{exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Add Category',exact:true}).click();await recordDialog().getByRole('button',{name:'Save',exact:true}).click();assert.equal(await recordDialog().locator(':invalid').count()>0,true);
  await recordDialog().getByLabel('Category name',{exact:true}).fill(`${prefix} UI category`);await recordDialog().getByRole('button',{name:'Save',exact:true}).click();await ready();
  await recordDialog().waitFor({state:'hidden'});await ready();
  const createdCategory=check(await privileged.from('categories').select('*').eq('name',`${prefix} UI category`).single(),'Inspecting UI category');
  const catRow=()=>page.locator(`tr[data-category-id="${createdCategory.id}"]`);
  await catRow().getByRole('button',{name:'Edit',exact:true}).click();await recordDialog().getByLabel('Category name',{exact:true}).fill(`${prefix} Renamed`);await recordDialog().getByRole('button',{name:'Save',exact:true}).click();await ready();
  await recordDialog().waitFor({state:'hidden'});await ready();
  await catRow().getByRole('button',{name:'Delete',exact:true}).click();await recordDialog().getByRole('button',{name:'Delete Category',exact:true}).click();await ready();
  await recordDialog().waitFor({state:'hidden'});await ready();
  await page.locator('.admin-nav a[href="/admin/users"]').click();await ready();
  await page.getByLabel('Search users by name or email',{exact:true}).fill(other.email);await page.locator('form').getByRole('button',{name:'Search',exact:true}).click();await ready();
  const userRow=()=>page.locator(`tr[data-user-id="${other.id}"]`);
  await userRow().getByRole('button',{name:'View',exact:true}).click();await recordDialog().getByText('User Details',{exact:true}).waitFor();await page.keyboard.press('Escape');
  await userRow().getByRole('button',{name:'Edit',exact:true}).click();await recordDialog().getByLabel('Display name',{exact:true}).fill(`${prefix} UI Edited`);await recordDialog().getByRole('button',{name:'Save',exact:true}).click();await ready();
  await recordDialog().waitFor({state:'hidden'});await ready();
  for(const width of [1440,768,375,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.setViewportSize({width:1440,height:1000});
  await mkdir('node_modules/.admin-verification',{recursive:true});await page.screenshot({path:'node_modules/.admin-verification/users.png',fullPage:true});
  await userRow().getByRole('button',{name:'Delete',exact:true}).click();await recordDialog().getByLabel('Type the user email to confirm',{exact:true}).fill(other.email);await recordDialog().getByRole('button',{name:'Delete User',exact:true}).click();
  await page.getByText('No users match your search.',{exact:true}).waitFor();
  assert.ok((await privileged.auth.admin.getUserById(other.id)).error);
  assert.equal(await page.locator('.modal-backdrop').count(),0);
  await page.goto(`${base}/admin`);await page.locator('[data-admin-stats]:not([hidden])').waitFor();await page.reload();await page.locator('[data-admin-stats]:not([hidden])').waitFor();
  await page.locator('.admin-nav a[href="/admin/categories"]').click();await ready();await page.goBack();await page.locator('[data-admin-stats]:not([hidden])').waitFor();await page.goForward();await ready();
  for(const path of ['/admin','/admin/listings','/admin/categories','/admin/users']){
    await page.goto(`${base}${path}`);if(path==='/admin')await page.locator('[data-admin-stats]:not([hidden])').waitFor();else await ready();
    for(const width of [1440,768,375,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if([1440,375].includes(width))await page.screenshot({path:`node_modules/.admin-verification/${path.replaceAll('/','-')}-${width}.png`,fullPage:true});}
    await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: browser admin guards, dashboard counts, real listings pagination/search, View/Edit/Image modals, delete cancel, category create/edit/delete/in-use handling, user View/Edit/Delete, responsive layout, direct refresh, history, and modal cleanup.');
}finally{
  if(browser)await browser.close();
  for(const fixture of fixtures){
    const response=await privileged.auth.admin.getUserById(fixture.id);
    if(response.data?.user?.app_metadata?.minimarket_admin_test===true){await deleteStorage(fixture.id);check(await privileged.auth.admin.deleteUser(fixture.id),'Removing marked fixture user');}
    await fixture.client.auth.signOut().catch(()=>{});
  }
  if(category)check(await privileged.from('categories').delete().eq('id',category.id),'Removing temporary category');
  const extra=await privileged.from('categories').select('id').like('name',`${prefix}%`);for(const record of extra.data||[])check(await privileged.from('categories').delete().eq('id',record.id),'Removing marked UI category');
  await admin.auth.signOut();
  console.log('Removed marked test accounts, listings, images, favorites, and categories; existing demo records preserved.');
}
