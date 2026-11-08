// Role changes affect only marked temporary accounts. Existing roles are never changed.
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
const privileged=createClient(config.url,config.key,options);
const makeClient=()=>createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const admin=makeClient(),fixtures=[];
let browser;
const check=(response,label)=>{if(response.error)throw new Error(`${label} failed (${response.error.code||response.error.context?.status||'request'}).`);return response.data;};
const call=(client,id,patch)=>client.functions.invoke('minimarket-admin',{body:{action:'users.update',id,patch}});
const role=async id=>check(await privileged.from('user_roles').select('role').eq('user_id',id).single(),'Reading role').role;
try{
  for(const name of ['Target','Operator']){
    const email=`role-test-${randomUUID()}@test.com`,password=randomUUID();
    const data=check(await privileged.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:`Role ${name}`},app_metadata:{minimarket_role_test:true}}),'Creating marked role fixture');
    const client=makeClient();check(await client.auth.signInWithPassword({email,password}),'Signing in role fixture');
    fixtures.push({id:data.user.id,email,password,client});
  }
  const [target,operator]=fixtures;
  check(await admin.auth.signInWithPassword({email:'admin@admin.com',password:'pass123'}),'Signing in demo admin');
  assert.ok((await call(target.client,target.id,{role:'admin'})).error,'Ordinary users cannot promote themselves');
  assert.ok((await target.client.from('user_roles').update({role:'admin'}).eq('user_id',target.id)).error,'Direct writes remain denied');
  assert.ok((await call(admin,target.id,{role:'owner',username:'Must not be saved'})).error,'Unsupported roles are rejected');
  assert.equal(check(await privileged.from('profiles').select('username').eq('id',target.id).single(),'Reading unchanged name').username,'Role Target');
  const promoted=check(await call(admin,target.id,{role:'admin'}),'Promoting fixture');assert.equal(promoted.user.role,'admin');assert.equal(await role(target.id),'admin');
  assert.equal(check(await privileged.from('profiles').select('role').eq('id',target.id).single(),'Role mirror').role,'admin');
  check(await target.client.functions.invoke('minimarket-admin',{body:{action:'users.list',page:1,pageSize:1}}),'New admin endpoint access');
  check(await call(admin,target.id,{role:'user'}),'Demoting fixture');assert.equal(await role(target.id),'user');
  assert.ok((await target.client.functions.invoke('minimarket-admin',{body:{action:'users.list'}})).error,'Revocation uses current database role, not the old JWT');
  console.log('PASS: admin promotion/demotion, ordinary-user/direct-write denial, role validation before writes, profile mirror, and current-role authorization.');

  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),base=process.env.ADMIN_TEST_URL||'http://127.0.0.1:5180',errors=[];
  page.on('pageerror',error=>errors.push(error.message));let acceptDiscard=false,updates=0;
  page.on('dialog',dialog=>dialog[acceptDiscard?'accept':'dismiss']());
  await page.route('**/functions/v1/minimarket-admin',async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='users.update'){updates++;await new Promise(resolve=>setTimeout(resolve,150));}
    await route.continue();
  });
  async function login(user){
    await page.goto(`${base}/login`);await page.waitForFunction(()=>location.pathname!=='/login'||document.querySelector('form[aria-label="Login"]'));
    if(new URL(page.url()).pathname!=='/login'){await page.locator('[data-logout]').click();await page.waitForURL(url=>url.pathname==='/');await page.goto(`${base}/login`);}
    await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Login',exact:true}).click();await page.waitForURL(url=>url.pathname==='/dashboard');
    await page.goto(`${base}/admin/users`);await page.locator('[data-admin-table]:not([hidden])').waitFor();
  }
  const dialog=()=>page.locator('.admin-dialog');
  const row=id=>page.locator(`tr[data-user-id="${id}"]`);
  const open=async id=>{await row(id).getByRole('button',{name:'Edit',exact:true}).click();await dialog().getByLabel('Role',{exact:true}).waitFor();};
  const submit=()=>dialog().locator('form').evaluate(form=>{for(let i=0;i<2;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await login({email:'admin@admin.com',password:'pass123'});
  await open(target.id);assert.equal(await dialog().getByLabel('Role',{exact:true}).inputValue(),'user');
  await dialog().getByLabel('Role',{exact:true}).selectOption('admin');
  await dialog().getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await dialog().isVisible(),true,'Role-only changes trigger the dirty guard');
  acceptDiscard=true;await dialog().getByRole('button',{name:'Cancel',exact:true}).click();acceptDiscard=false;
  assert.equal(await role(target.id),'user');assert.equal(updates,0,'Cancel sends no update');
  await open(target.id);await dialog().getByLabel('Role',{exact:true}).selectOption('admin');
  await submit();assert.equal(await dialog().getByLabel('Role',{exact:true}).isDisabled(),true);
  await dialog().waitFor({state:'hidden'});await page.waitForFunction(id=>document.querySelector(`tr[data-user-id="${id}"] td:nth-child(3)`)?.textContent==='admin',target.id);
  assert.equal(updates,1,'Double-submit produces one update');assert.equal(await role(target.id),'admin');
  await open(target.id);assert.equal(await dialog().getByLabel('Role',{exact:true}).inputValue(),'admin');
  await page.setViewportSize({width:375,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mkdir('node_modules/.role-verification',{recursive:true});await page.screenshot({path:'node_modules/.role-verification/edit-role-mobile.png'});
  await dialog().getByLabel('Role',{exact:true}).selectOption('user');await dialog().getByRole('button',{name:'Save',exact:true}).click();await dialog().waitFor({state:'hidden'});
  assert.equal(await role(target.id),'user');await page.setViewportSize({width:1440,height:1000});

  check(await call(admin,operator.id,{role:'admin'}),'Promoting temporary operator');
  await login(operator);await open(operator.id);await dialog().getByLabel('Role',{exact:true}).selectOption('user');await dialog().getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/my-listings');
  assert.equal(await role(operator.id),'user');assert.equal(await page.locator('header a[href="/admin"]').isVisible(),false);assert.equal(await page.locator('.modal-backdrop').count(),0);
  assert.equal(await page.locator('.minimarket-toast-error').count(),0,'Self-demotion reports success before losing privileged access');
  await page.goto(`${base}/admin/users`);await page.waitForURL(url=>url.pathname==='/my-listings');
  assert.deepEqual(errors,[]);
  console.log('PASS: role selector/save/cancel, unsaved-change warning, duplicate prevention, pending disabled select, refreshed table, mobile layout, and self-demotion access removal.');
}finally{
  if(browser)await browser.close();
  for(const fixture of fixtures){const data=await privileged.auth.admin.getUserById(fixture.id);if(data.data?.user?.app_metadata?.minimarket_role_test===true)check(await privileged.auth.admin.deleteUser(fixture.id),'Removing marked role fixture');await fixture.client.auth.signOut().catch(()=>{});}
  await admin.auth.signOut();
  console.log('Removed marked role test accounts; existing user roles were not changed.');
}
