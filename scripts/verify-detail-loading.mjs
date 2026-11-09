// Read-only regression for legacy/attachment photos and route restoration flashes.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const bee='a9ca0182-1acc-4c22-846f-ef7453e137af',attached='c41d1909-b893-4304-a7f5-0c467c85dde9';
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.DETAILS_TEST_URL||'http://127.0.0.1:5180';
  await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill('admin@admin.com');await page.getByLabel('Password',{exact:true}).fill('pass123');await page.locator('form button[type=submit]').click();await page.waitForURL('**/dashboard');
  const ready=()=>page.locator('[data-details-content]:not([hidden])').waitFor();
  async function fitted(selector){
    const img=page.locator(selector);await img.waitFor();
    assert.equal(await img.evaluate(image=>{
      const box=image.getBoundingClientRect(),frame=image.closest('figure,.listing-details-media').getBoundingClientRect();
      return image.complete&&image.naturalWidth>0&&Math.abs(box.width-frame.width)<3&&Math.abs(box.width/box.height-image.naturalWidth/image.naturalHeight)<.02;
    }),true,'Frame must fit the decoded image without side panels');
  }
  await page.goto(base+'/favorites');await page.locator('[data-favorites-grid][aria-busy=false]').waitFor();
  await page.locator(`[data-listing-link][href="/listings/${bee}"]`).click();await ready();await fitted('[data-details-image]');
  const favoriteSource=await page.locator('[data-details-image]').getAttribute('src');
  // Slow session restoration must not mount/fetch a public page twice.
  await page.route('**/auth/v1/user',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.continue();});
  let listingReads=0;
  page.on('request',r=>{if(r.method()==='GET'&&new URL(r.url()).pathname==='/rest/v1/listings')listingReads++;});
  await page.goto(base+`/listings/${bee}`);await ready();await fitted('[data-details-image]');assert.equal(listingReads,1);assert.equal(await page.locator('[data-details-image]').getAttribute('src'),favoriteSource);
  await page.setViewportSize({width:390,height:844});await fitted('[data-details-image]');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Delay attachment metadata while a legacy URL is available: no fallback may flash first.
  let release,arrived;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{arrived=resolve;});
  await page.route('**/rest/v1/listing_attachments*',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('listing_id')===`eq.${attached}`){arrived();await gate;}await route.continue();});
  let legacyRequests=0;page.on('request',r=>{if(r.resourceType()==='image'&&r.url().includes('/object/public/listing-images/'))legacyRequests++;});
  await page.goto(base+`/listings/${attached}`);await started;
  assert.equal(await page.locator('[data-details-content]').isVisible(),false);assert.equal(await page.locator('[data-details-status]').isVisible(),true);assert.equal(legacyRequests,0);
  release();await ready();await fitted('[data-details-gallery] img');assert.equal(await page.locator('.listing-details-media').isVisible(),false);assert.equal(legacyRequests,0);
  await page.setViewportSize({width:1440,height:1000});await fitted('[data-details-gallery] img');
  await page.goto(base+'/listings');await page.locator(`[data-listing-link][href="/listings/${bee}"]`).waitFor();await page.locator(`[data-listing-link][href="/listings/${bee}"]`).click();await ready();await fitted('#view-listing-modal [data-details-image]');
  assert.deepEqual(errors,[]);
  console.log('PASS: Favorites/direct/modal legacy photos share fitted sizing; attachment image loads before content reveal; no legacy-first flash, no double fetch during session restoration, desktop/mobile fit, no page errors. No records changed.');
}finally{await browser.close();}
