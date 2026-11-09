// Read-only browser verification of every search/filter view.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.FILTERS_TEST_URL||'http://127.0.0.1:5180';
  const clear=()=>page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.goto(base+'/');await page.getByLabel('Search advertisements',{exact:true}).fill('draft');await clear();assert.equal(await page.getByLabel('Search advertisements',{exact:true}).inputValue(),'');assert.equal(new URL(page.url()).pathname,'/');
  await page.goto(base+'/listings');await page.waitForFunction(()=>/\d+ listings?/.test(document.querySelector('[data-browse-count]')?.textContent||''));
  const total=await page.locator('[data-browse-grid] .listing-card').count();assert.ok(total>0);
  await page.locator('#browse-search').fill('draft without submit');await clear();assert.equal(await page.locator('#browse-search').inputValue(),'');
  await page.locator('#browse-search').fill('no-results-for-this-filter-94183');await page.locator('#browse-category').selectOption({index:1});await page.locator('#browse-sort').selectOption('price-desc');
  assert.equal(await page.locator('[data-browse-grid] .listing-card').count(),0);await clear();assert.equal(new URL(page.url()).search,'');assert.equal(await page.locator('#browse-category').inputValue(),'');assert.equal(await page.locator('#browse-sort').inputValue(),'newest');assert.equal(await page.locator('[data-browse-grid] .listing-card').count(),total);
  await page.locator('#browse-search').fill('no-results-for-this-filter-94183');await page.getByRole('button',{name:'Search',exact:true}).click();assert.equal(await page.locator('[data-browse-grid] .listing-card').count(),0);await page.locator('#browse-search').fill('');assert.equal(await page.locator('[data-browse-grid] .listing-card').count(),total);
  await page.goBack();assert.equal(await page.locator('[data-browse-grid] .listing-card').count(),0);await clear();assert.equal(await page.locator('[data-browse-grid] .listing-card').count(),total);
  await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill('admin@admin.com');await page.getByLabel('Password',{exact:true}).fill('pass123');await page.locator('form button[type=submit]').click();await page.waitForURL('**/dashboard');
  for(const route of ['listings','categories','users']){
    await page.goto(base+`/admin/${route}`);const ready=()=>page.locator('[data-admin-table]:not([hidden])').waitFor();await ready();
    const baseline=await page.locator('tbody tr').count(),search=page.locator('#admin-search');
    const next=page.getByRole('button',{name:'Next',exact:true});if(await next.isEnabled()){await next.click();await ready();await clear();await ready();assert.match(await page.locator('[data-admin-pager]').innerText(),/Page 1 of/);}
    if(route==='listings')await page.locator('#admin-category').selectOption({index:1});
    await search.fill('no-results-for-this-filter-94183');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByText(route==='listings'?'No listings match these filters.':route==='categories'?'No categories match your search.':'No users match your search.',{exact:true}).waitFor();
    await clear();await ready();assert.equal(await search.inputValue(),'');assert.equal(await page.locator('tbody tr').count(),baseline);if(route==='listings')assert.equal(await page.locator('#admin-category').inputValue(),'');
    const existing=await page.locator('tbody tr').first().locator('td').nth(route==='listings'?1:route==='users'?1:0).innerText();
    await search.fill(existing);await page.getByRole('button',{name:'Search',exact:true}).click();await ready();
    await search.fill('');await ready();assert.equal(await page.locator('tbody tr').count(),baseline,'Clearing native search restores list');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('button',{name:'Clear filters',exact:true}).isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: Home draft reset; Browse search/category/sort/URL/history reset; all admin searches, empty results, pagination reset, native search clearing, and mobile Clear filters controls. No records changed.');
}finally{await browser.close();}
