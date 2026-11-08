// Live API + browser checks. Mutations belong only to marked temporary accounts.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {readConfig} from './seed.js';
const config=readConfig(parseEnv(await readFile('.env.seed.local','utf8')));
const env=parseEnv(await readFile('.env.local','utf8'));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(config.url,config.key,options),anon=createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const check=(r,label)=>{if(r.error)throw new Error(`${label} failed (${r.error.code||'request'})`);return r.data;};
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const base=process.env.FAVORITES_TEST_URL||'http://127.0.0.1:5180',users=[],listings=[];
const errors=[];
try{
  for(const name of ['Owner','Other']){
    const email=`favorites-${randomUUID()}@test.com`,password=randomUUID();
    const user=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:`Favorites verification ${name}`},app_metadata:{minimarket_favorites_test:true}}),'Fixture account').user;
    const client=createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
    check(await client.auth.signInWithPassword({email,password}),'Fixture sign in');users.push({...user,password,client});
  }
  const [owner,other]=users;
  const category=check(await anon.from('categories').select('id,name').limit(1),'Category')[0];
  for(let n=0;n<3;n++)listings.push(check(await other.client.from('listings').insert({owner_id:other.id,category_id:category.id,title:`Favorites check ${n} ${randomUUID()}`,description:'A saved listing with a useful description.',price:n+10}).select().single(),'Fixture listing'));
  const first=listings[0];
  check(await other.client.from('favorites').insert({user_id:other.id,listing_id:first.id}),'Other favorite');
  assert.equal(check(await owner.client.from('favorites').select('*'),'Own scope').length,0);
  assert.ok((await owner.client.from('favorites').insert({user_id:other.id,listing_id:listings[1].id})).error,'Spoofed owner rejected');
  assert.ok((await anon.from('favorites').insert({user_id:owner.id,listing_id:first.id})).error,'Anonymous insert rejected');
  const deniedDelete=await owner.client.from('favorites').delete().eq('user_id',other.id).select();
  assert.ok(deniedDelete.error||deniedDelete.data.length===0);
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/favorites');await page.waitForURL('**/login?**');assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/favorites');
  await page.goto(base+`/listings/${first.id}`);const guestHeart=page.locator('[data-favorite-id]');await guestHeart.waitFor();await guestHeart.click();await page.waitForURL('**/login?**');
  assert.equal(new URL(page.url()).searchParams.get('returnTo'),`/listings/${first.id}`);
  await page.getByLabel('Email',{exact:true}).fill(owner.email);await page.getByLabel('Password',{exact:true}).fill(owner.password);await page.locator('form button[type=submit]').click();await page.waitForURL(`**/listings/${first.id}`);
  await page.locator('[data-details-content]:not([hidden]) [data-favorite-id]').waitFor();
  let posts=0,failPost=true;
  await page.route('**/rest/v1/favorites*',async route=>{
    if(route.request().method()==='POST'){
      posts++;await new Promise(resolve=>setTimeout(resolve,250));
      if(failPost)return route.fulfill({status:400,json:{message:'Injected failure',code:'42501'}});
    }
    return route.continue();
  });
  await page.locator('[data-favorite-id]').evaluate(button=>{button.click();button.click();});
  await page.locator('.minimarket-toast-error').waitFor();assert.equal(posts,1);
  assert.equal(await page.locator('[data-favorite-id]').getAttribute('aria-pressed'),'false');
  failPost=false;await page.locator('[data-favorite-id]').click();await page.waitForFunction(()=>document.querySelector('[data-favorite-id]')?.getAttribute('aria-pressed')==='true');
  assert.ok((await owner.client.from('favorites').insert({user_id:owner.id,listing_id:first.id})).error,'Database uniqueness');
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-favorite-id]')?.getAttribute('aria-pressed')==='true');
  await page.goto(base+'/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();
  assert.equal(await page.locator('[data-favorite-listing]').count(),1);
  assert.match(await page.locator('[data-listing-category]').innerText(),new RegExp(category.name));
  assert.match(await page.locator('[data-listing-price]').innerText(),/\u20ac|EUR/);
  assert.equal(await page.locator('[data-favorite-id]').getAttribute('aria-pressed'),'true');
  await page.goto(base+'/dashboard');await page.waitForFunction(()=>document.querySelector('[data-stat-favorites]')?.textContent==='1');
  await page.goto(base+'/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();await page.locator('[data-favorite-id]').click();
  await page.getByText("You haven't saved any listings yet.",{exact:true}).waitFor();await page.locator('[data-favorites-feedback]').getByRole('link',{name:'Browse Listings',exact:true}).click();await page.waitForURL('**/listings');
  const browseHeart=page.locator(`[data-browse-grid] [data-favorite-id="${first.id}"]`);await browseHeart.waitFor();await browseHeart.click();await page.waitForFunction(id=>document.querySelector(`[data-favorite-id="${id}"]`)?.getAttribute('aria-pressed')==='true',first.id);
  // Check modal state and underlying browse heart synchronization.
  await page.locator(`[data-listing-link][href="/listings/${first.id}"]`).click();
  await page.locator('.modal.show [data-favorite-id][aria-pressed=true]').waitFor();
  await page.locator('.modal.show [data-favorite-id]').click();await page.locator('.modal.show [data-favorite-id][aria-pressed=false]').waitFor();await page.keyboard.press('Escape');
  assert.equal(await browseHeart.getAttribute('aria-pressed'),'false');
  const visual=check(await anon.from('listing_attachments').select('listing_id').eq('mime_type','image/jpeg').limit(1),'Existing listing photo')[0];
  if(visual){
    check(await owner.client.from('favorites').insert({user_id:owner.id,listing_id:visual.listing_id}),'Save image listing');
    await page.goto(base+'/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-favorites-grid] [data-listing-image]')?.naturalWidth>0);
    check(await owner.client.from('favorites').delete().eq('user_id',owner.id).eq('listing_id',visual.listing_id),'Remove image favorite');
  }
  for(const listing of listings)check(await owner.client.from('favorites').insert({user_id:owner.id,listing_id:listing.id}),'Seed own favorites');
  await page.goto(base+'/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();
  assert.equal(await page.locator('[data-favorite-listing]').first().getAttribute('data-favorite-listing'),listings[2].id,'Newest saved first');
  await mkdir('node_modules/.favorites-verification',{recursive:true});
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`node_modules/.favorites-verification/${width}.png`,fullPage:true});}
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();assert.equal(await page.locator('[data-favorite-listing]').count(),3);
  await page.goto(base+'/dashboard');await page.waitForFunction(()=>document.querySelector('[data-stat-favorites]')?.textContent==='3');
  await page.goBack();await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();await page.goForward();await page.waitForFunction(()=>document.querySelector('[data-stat-favorites]')?.textContent==='3');
  // Deleted listings disappear via existing FK cascade.
  check(await other.client.from('listings').delete().eq('id',listings[2].id),'Delete fixture');
  await page.goto(base+'/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();assert.equal(await page.locator('[data-favorite-listing]').count(),2);
  let failRead=true;
  await page.route('**/rest/v1/favorites*',route=>route.request().method()==='GET'&&failRead?route.fulfill({status:400,json:{message:'Injected read failure',code:'42501'}}):route.continue());
  await page.reload();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();failRead=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();assert.equal(await page.locator('[data-favorite-listing]').count(),2);
  await page.locator('[data-logout]').click();await page.waitForURL(base+'/');await page.goto(base+'/favorites');await page.waitForURL('**/login?**');
  await page.getByLabel('Email',{exact:true}).fill(other.email);await page.getByLabel('Password',{exact:true}).fill(other.password);await page.locator('form button[type=submit]').click();await page.waitForURL('**/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();
  assert.equal(await page.locator('[data-favorite-listing]').count(),1,'Account switch has no previous-user cache');
  assert.deepEqual(errors,[]);
  console.log('PASS: protected route, guest heart/login return, own favorites/RLS, duplicate prevention, failed mutation retention, details/browse/modal hearts, refresh/history, newest-first cards, removal/empty state, dashboard counts, deleted listings, error/retry, account switching, desktop/tablet/mobile.');
}finally{
  await browser.close();
  for(const listing of listings)check(await admin.from('listings').delete().eq('id',listing.id),'Fixture listing cleanup');
  for(const user of users)check(await admin.auth.admin.deleteUser(user.id),'Fixture user cleanup');
}
