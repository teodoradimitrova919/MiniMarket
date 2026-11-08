import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {readConfig} from './seed.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const config=readConfig(parseEnv(await readFile('.env.seed.local','utf8')));
const admin=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
const check=(r,label)=>{if(r.error)throw new Error(`${label} failed`);return r.data;};
const email=`attachment-browser-${randomUUID()}@test.com`,password=randomUUID(),title=`Attachment browser ${randomUUID()}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBFkAAAAASUVORK5CYII=','base64');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
let owner;const errors=[];
try{
  owner=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:'Attachment browser verification'}}),'Fixture user').user;
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const base=process.env.ATTACHMENTS_TEST_URL||'http://127.0.0.1:5180';
  await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.locator('form button[type=submit]').click();await page.waitForURL('**/dashboard');
  await page.goto(base+'/listings/add');await page.locator('[data-listing-fields]:not([disabled])').waitFor();
  await page.locator('#listing-title').fill(title);await page.locator('#listing-price').fill('12');
  const category=await page.locator('#listing-category option').nth(1).getAttribute('value');await page.locator('#listing-category').selectOption(category);
  await page.locator('[data-select-images]').setInputFiles([{name:'same.png',mimeType:'image/png',buffer:png},{name:'same.png',mimeType:'image/png',buffer:png}]);
  assert.equal(await page.locator('[data-pending-attachments] img').count(),2);
  await page.locator('[data-select-documents]').setInputFiles({name:'manual.pdf',mimeType:'application/pdf',buffer:pdf});
  let injected=false;
  await page.route('**/storage/v1/object/listing-attachments/**',async route=>{
    if(!injected&&route.request().method()==='POST'&&route.request().url().endsWith('.pdf')){injected=true;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Injected upload failure',error:'failure'})});}
    return route.continue();
  });
  await page.locator('[data-save-listing]').click();await page.locator('[data-save-error]:not([hidden])').waitFor();
  assert.match(await page.locator('[data-save-error]').innerText(),/listing is saved/);assert.equal(injected,true);
  const rows=check(await admin.from('listings').select('id').eq('owner_id',owner.id),'Saved listing');assert.equal(rows.length,1);
  const id=rows[0].id;
  assert.equal(check(await admin.from('listing_attachments').select('id').eq('listing_id',id),'Partial attachments').length,2);
  await page.locator('[data-save-listing]').click();await page.waitForURL('**/my-listings');
  assert.equal(check(await admin.from('listings').select('id').eq('owner_id',owner.id),'No duplicate listing').length,1);
  assert.equal(check(await admin.from('listing_attachments').select('id').eq('listing_id',id),'Completed attachments').length,3);
  await page.goto(base+`/listings/${id}/edit`);await page.locator('[data-attachment-images] img').first().waitFor();
  await page.locator('[data-select-images]:not([disabled])').waitFor();
  await page.getByRole('button',{name:'Remove',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-attachment-images] img').length===1);
  await page.locator('[data-select-images]').setInputFiles({name:'new.png',mimeType:'image/png',buffer:png});
  await page.locator('[data-save-listing]').click();await page.waitForURL('**/my-listings');
  // Anonymous responsive gallery, downloads, card thumbnail, no management controls.
  const visitor=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});visitor.on('pageerror',e=>errors.push(e.message));
  await visitor.goto(base+`/listings/${id}`);await visitor.locator('[data-attachment-images] img').first().waitFor();
  await visitor.waitForFunction(()=>[...document.querySelectorAll('[data-attachment-images] img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await visitor.locator('[data-remove-attachment]').count(),0);
  assert.equal(await visitor.locator('[data-attachment-fields]').isVisible(),false);
  const downloadEvent=visitor.waitForEvent('download');await visitor.locator('[data-attachment-documents]').getByRole('button',{name:'Download',exact:true}).click();
  assert.equal((await downloadEvent).suggestedFilename(),'manual.pdf');
  assert.equal(await visitor.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await mkdir('node_modules/.attachment-verification',{recursive:true});await visitor.screenshot({path:'node_modules/.attachment-verification/mobile-details.png',fullPage:true});
  await page.goto(base+`/listings/${id}/edit`);await page.locator('[data-attachment-images] img').first().waitFor();await page.screenshot({path:'node_modules/.attachment-verification/desktop-edit.png',fullPage:true});
  await visitor.goto(base+'/listings');await visitor.locator(`[data-listing-link][href="/listings/${id}"]`).waitFor();
  const card=visitor.locator(`[data-listing-link][href="/listings/${id}"]`);
  await card.locator('[data-listing-image]').waitFor();assert.ok((await card.locator('[data-listing-image]').getAttribute('src')).includes('/object/sign/'));
  assert.deepEqual(errors,[]);
  console.log('PASS: browser multiple-image previews, PDF selection, partial upload failure/retry without duplicate listing, edit upload/removal, anonymous gallery/download, signed card thumbnail, mobile layout, no page errors.');
}finally{
  await browser.close();
  if(owner){
    const listings=check(await admin.from('listings').select('id').eq('owner_id',owner.id),'Fixture listings');
    for(const listing of listings){const objects=check(await admin.storage.from('listing-attachments').list(listing.id),'Fixture objects');if(objects.length)check(await admin.storage.from('listing-attachments').remove(objects.map(o=>`${listing.id}/${o.name}`)),'Fixture object cleanup');check(await admin.from('listings').delete().eq('id',listing.id),'Fixture listing cleanup');}
    check(await admin.auth.admin.deleteUser(owner.id),'Fixture account cleanup');
  }
}
