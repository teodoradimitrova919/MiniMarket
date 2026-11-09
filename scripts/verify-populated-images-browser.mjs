// Uses the existing local verification browser installation; no frontend dependency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const credits=JSON.parse(await readFile(new URL('../src/data/populated-image-credits.json',import.meta.url)));
assert.ok(credits.length,'Run population before checking its UI');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const base=process.env.IMAGES_TEST_URL||'http://127.0.0.1:5180';
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 const imagesLoaded=async selector=>{
   await page.locator(selector).first().waitFor();
   await page.locator(selector).evaluateAll(images=>images.forEach(image=>image.loading='eager'));
   await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].every(image=>image.complete&&image.naturalWidth>0),selector);
 };
 await page.goto(base+'/');await imagesLoaded('[data-listing-image]:not([hidden])');
 await page.goto(base+'/listings');await imagesLoaded('[data-listing-image]:not([hidden])');
 assert.ok(await page.getByText('Illustrative photo · credits',{exact:true}).count()>0);
 const photo=credits.find(c=>c.title==='Oak-Effect Coffee Table');assert.ok(photo);
 const card=page.locator('.listing-card').filter({has:page.locator(`[data-listing-link][href="/listings/${photo.listingId}"]`)});
 assert.equal(await card.locator('img').getAttribute('src'),photo.imageUrl);
 await card.locator('[data-listing-link]').click();
 await imagesLoaded('[data-details-image]:not([hidden])');
 assert.equal(await page.locator('[data-details-image]').getAttribute('src'),photo.imageUrl);
 await page.locator('[data-image-credit] summary').click();
 assert.ok(await page.locator('[data-image-credit]').innerText().then(t=>t.includes(photo.author)&&t.includes('Not a photo of the actual item')));
 await page.goto(base+`/listings/${photo.listingId}`);await imagesLoaded('[data-details-image]:not([hidden])');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'node_modules/.image-population/mobile-details.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill('admin@admin.com');await page.getByLabel('Password',{exact:true}).fill('pass123');await page.locator('form button[type=submit]').click();await page.waitForURL('**/dashboard');
 await page.goto(base+'/my-listings');await imagesLoaded('.listing-thumbnail img');
 const row=page.locator(`[data-listing-id="${photo.listingId}"]`);
 assert.equal(await row.locator('img').getAttribute('src'),photo.imageUrl);
 assert.match(await row.locator('.listing-thumbnail a').getAttribute('aria-label'),/Illustrative photo/);
 await page.goto(base+'/favorites');await imagesLoaded('[data-listing-image]:not([hidden])');
 assert.ok(await page.getByText('Illustrative photo · credits',{exact:true}).count()>0);
 await page.goto(base+'/admin/listings');await page.locator('[data-admin-table]:not([hidden])').waitFor();
 await page.getByLabel('Search by title',{exact:true}).fill(photo.title);await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.waitForFunction(url=>document.querySelector('.listing-thumbnail img')?.src===url,photo.imageUrl);
 await imagesLoaded('.listing-thumbnail img');
 await page.screenshot({path:'node_modules/.image-population/admin-listings.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: Home, Browse, My Listings, Favorites, details/modal/direct/mobile, admin thumbnail, source credits and no page errors. Dashboard has no photo component.');
} finally {await browser.close();}
