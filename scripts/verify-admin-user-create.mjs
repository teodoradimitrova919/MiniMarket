import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {readConfig} from './seed.js';
const config=readConfig(parseEnv(await readFile('.env.seed.local','utf8'))),env=parseEnv(await readFile('.env.local','utf8'));
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(config.url,config.key,options);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const email=`admin-create-${randomUUID()}@test.com`,password=randomUUID(),name=`Created verification ${randomUUID()}`;
let createdId;
const desiredRole=process.env.ADMIN_CREATE_ROLE==='admin'?'admin':'user';
const check=(r,label)=>{if(r.error)throw new Error(`${label} failed`);return r.data;};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const base=process.env.ADMIN_TEST_URL||'http://127.0.0.1:5180';
  await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill('admin@admin.com');await page.getByLabel('Password',{exact:true}).fill('pass123');await page.locator('form button[type=submit]').click();await page.waitForURL('**/dashboard');
  await page.goto(base+'/admin/users');const ready=()=>page.locator('[data-admin-table]:not([hidden])').waitFor();await ready();
  const search=page.getByLabel('Search users by name or email',{exact:true}),baseline=await page.locator('tbody tr').count();assert.ok(baseline>1);
  const existingEmail=await page.locator('tbody tr').first().locator('td').nth(1).innerText();
  async function filter(value){await search.fill(value);await page.getByRole('button',{name:'Search',exact:true}).click();await ready();}
  await filter(existingEmail);assert.equal(await page.locator('tbody tr').count(),1);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();await ready();assert.equal(await search.inputValue(),'');assert.equal(await page.locator('tbody tr').count(),baseline);
  await filter(existingEmail);await search.fill('');await ready();assert.equal(await page.locator('tbody tr').count(),baseline,'Clearing input restores all users');
  const dialog=page.locator('.admin-dialog');await page.getByRole('button',{name:'Add User',exact:true}).click();await dialog.getByRole('button',{name:'Create User',exact:true}).click();assert.ok(await dialog.locator(':invalid').count()>0);
  await dialog.getByLabel('Display name',{exact:true}).fill(name);await dialog.getByLabel('Email address',{exact:true}).fill(email);await dialog.getByLabel('Password',{exact:true}).fill(password);
  assert.equal(await dialog.getByLabel('Role',{exact:true}).inputValue(),'user');
  await dialog.getByLabel('Role',{exact:true}).selectOption(desiredRole);
  let calls=0;page.on('request',r=>{if(r.url().includes('/functions/v1/minimarket-admin')&&r.postDataJSON()?.action==='users.create')calls++;});
  const response=page.waitForResponse(r=>r.url().includes('/functions/v1/minimarket-admin')&&r.request().postDataJSON()?.action==='users.create');
  await dialog.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  const result=await response;assert.equal(result.status(),200);const dto=await result.json();createdId=dto.user.id;assert.equal(dto.user.role,desiredRole);assert.equal(dto.roleAssignmentPending,false);assert.equal(dto.user.password,undefined);assert.equal(dto.user.user_metadata,undefined);
  await dialog.waitFor({state:'hidden'});assert.equal(calls,1);await ready();
  assert.equal(await page.locator('header a[href="/admin"]').isVisible(),true,'Creating user preserves admin session');
  await filter(email);assert.equal(await page.locator(`tr[data-user-id="${createdId}"]`).count(),1);assert.equal(await page.locator(`tr[data-user-id="${createdId}"] td`).nth(2).innerText(),desiredRole);
  const user=createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
  check(await user.auth.signInWithPassword({email,password}),'Created account login');assert.equal(check(await user.from('user_roles').select('role').eq('user_id',createdId).single(),'Selected role').role,desiredRole);
  assert.equal(check(await user.from('profiles').select('role').eq('id',createdId).single(),'Profile role mirror').role,desiredRole);
  if(desiredRole==='user')assert.ok((await user.functions.invoke('minimarket-admin',{body:{action:'users.create',user:{username:name,email:`denied-${randomUUID()}@test.com`,password,role:'admin'}}})).error,'Ordinary users cannot create administrator accounts');
  else check(await user.rpc('admin_overview'),'Created administrator access');
  const anon=createClient(config.url,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);assert.ok((await anon.functions.invoke('minimarket-admin',{body:{action:'users.create',user:{username:name,email,password}}})).error);
  await page.getByRole('button',{name:'Add User',exact:true}).click();await dialog.getByLabel('Display name',{exact:true}).fill(name);await dialog.getByLabel('Email address',{exact:true}).fill(email);await dialog.getByLabel('Password',{exact:true}).fill(password);await dialog.getByRole('button',{name:'Create User',exact:true}).click();await dialog.locator('[data-dialog-error]:not([hidden])').waitFor();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();await ready();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('button',{name:'Add User',exact:true}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'Clear filters',exact:true}).isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${desiredRole} account creation/role mirror/access, default User selector, validation, single submission, list refresh, login, preserved admin session, duplicate email, authorization, filters and mobile controls.`);
}finally{
  await browser.close();
  if(!createdId){for(let page=1;;page++){const data=check(await admin.auth.admin.listUsers({page,perPage:100}),'Fixture lookup');const found=data.users.find(u=>u.email===email);if(found){createdId=found.id;break;}if(data.users.length<100)break;}}
  if(createdId){const user=check(await admin.auth.admin.getUserById(createdId),'Fixture identity').user;assert.equal(user.email,email);check(await admin.auth.admin.deleteUser(createdId),'Fixture cleanup');}
}
