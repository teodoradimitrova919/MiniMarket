// Server-only. Auth Admin credentials and raw Auth records never reach the browser.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const uuid = value => { if (typeof value !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) fail(400, 'A valid record ID is required.'); return value; };
const text = (value, label, max=100) => { if (typeof value !== 'string' || !value.trim() || value.trim().length>max) fail(400, `${label} is required and must be at most ${max} characters.`); return value.trim(); };
function allowed(object, keys) { if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key=>!keys.includes(key))) fail(400, 'Unsupported request fields.'); }
async function result(query, message='The operation failed. Please try again.') {
  const response = await query;
  if (response.error) fail(response.error.code==='42501' ? 403 : 409, message);
  return response.data;
}
export function createAdminHandler({ admin, caller, url, origins }) {
  const bucket='listing-images';
  async function files(client, prefix) {
    const rows=[];
    for (let offset=0;;offset+=100) {
      const page=await result(client.storage.from(bucket).list(prefix,{ limit:100,offset,sortBy:{column:'name',order:'asc'} }), 'Image cleanup failed. Retry this operation.');
      for (const item of page) {
        if (item.id) rows.push(`${prefix}/${item.name}`);
        else rows.push(...await files(client,`${prefix}/${item.name}`));
      }
      if(page.length<100) return rows;
    }
  }
  async function removeFiles(client, paths) {
    for(let i=0;i<paths.length;i+=100) await result(client.storage.from(bucket).remove(paths.slice(i,i+100)), 'Image cleanup failed. Retry this operation before deleting the account or listing.');
  }
  async function summaries(client, users) {
    const details=users.length ? await result(client.rpc('admin_user_summaries',{ids:users.map(user=>user.id)})) : [];
    const byId=new Map(details.map(detail=>[detail.id,detail]));
    return users.map(user=>({ id:user.id,email:user.email || '',created_at:user.created_at,...byId.get(user.id) }));
  }
  async function userById(id) {
    const data=await result(admin.auth.admin.getUserById(id),'The user was not found.');
    if(!data.user) fail(404,'The user was not found.');
    return data.user;
  }
  async function cleanupUnused(client, listing) {
    const latest=await result(client.from('listings').select('image_url').eq('id',listing.id).single());
    const paths=await files(client,`${listing.owner_id}/${listing.id}`);
    const unused=paths.filter(path=>latest.image_url!==`${url}/storage/v1/object/public/${bucket}/${path}`);
    try { await removeFiles(client,unused); return false; } catch { return true; }
  }
  return async function handle(request) {
    const origin=request.headers.get('origin');
    const cors={ Vary:'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-api-version','Access-Control-Allow-Methods':'POST, OPTIONS' };
    if(origin && origins.includes(origin)) cors['Access-Control-Allow-Origin']=origin;
    const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
    try {
      if(origin && !origins.includes(origin)) fail(403,'This application origin is not allowed.');
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
      if(request.method!=='POST') fail(405,'Use a POST request.');
      const match=/^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '');
      if(!match) fail(401,'Please sign in to continue.');
      const verified=await admin.auth.getUser(match[1]);
      if(verified.error || !verified.data.user) fail(401,'Your session is invalid. Please sign in again.');
      const actor=verified.data.user;
      const client=caller(match[1]);
      const body=await request.json().catch(()=>fail(400,'Send a valid JSON request.'));
      allowed(body,['action','id','page','pageSize','search','patch','confirm','key']);
      const assignment=await result(client.from('user_roles').select('role').eq('user_id',actor.id).single(),'Your account is unavailable.');
      const isAdmin=assignment.role==='admin';
      // Owners use this same cleanup path when an owned listing contains Storage images.
      if(body.action==='listing.delete') {
        const id=uuid(body.id);
        if(body.confirm!==id) fail(400,'Explicit listing deletion confirmation is required.');
        const item=await result(client.rpc('begin_listing_deletion',{target:id}),'The listing cannot be deleted or is unavailable.');
        await removeFiles(admin,await files(admin,`${item.owner_id}/${id}`));
        await result(admin.from('listings').delete().eq('id',id),'Cleanup completed but listing deletion failed. Retry deletion.');
        return respond({deleted:true});
      }
      if(!isAdmin) fail(403,'Administrator access is required.');
      if(body.action==='users.list') {
        const page=Number(body.page ?? 1), pageSize=Number(body.pageSize ?? 20);
        if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>50) fail(400,'Invalid pagination.');
        if(body.search!=null && typeof body.search!=='string') fail(400,'Search must be text.');
        const search=body.search?.trim() ? text(body.search,'Search',100).toLowerCase() : '';
        let users, total;
        if(search) {
          // Auth Admin has no search argument: search all pages, then paginate matches.
          const matches=[];
          for(let current=1;;current++) {
            const data=await result(admin.auth.admin.listUsers({page:current,perPage:100}));
            const safe=await summaries(client,data.users);
            matches.push(...safe.filter(user=>`${user.email} ${user.username || ''}`.toLowerCase().includes(search)));
            if(data.users.length<100) break;
          }
          total=matches.length; users=matches.slice((page-1)*pageSize,page*pageSize);
        } else {
          const data=await result(admin.auth.admin.listUsers({page,perPage:pageSize}));
          users=await summaries(client,data.users);
          const stats=await result(client.rpc('admin_overview'));
          total=stats.totalUsers;
        }
        return respond({users,total,page,pageSize});
      }
      const id=uuid(body.id);
      if(body.action==='users.view') return respond({user:(await summaries(client,[await userById(id)]))[0]});
      if(body.action==='users.impact') {
        const user=(await summaries(client,[await userById(id)]))[0];
        const impact=await result(client.rpc('admin_user_impact',{target:id}));
        return respond({user,impact});
      }
      if(body.action==='users.update') {
        allowed(body.patch,['username','email']);
        if(!Object.keys(body.patch).length) fail(400,'Provide a display name or email.');
        await userById(id);
        const targetSummary=(await result(client.rpc('admin_user_summaries',{ids:[id]})))[0];
        if(targetSummary?.deletionPending) fail(409,'This account is pending deletion. Retry deletion instead of editing it.');
        if(body.patch.username!==undefined) text(body.patch.username,'Display name',80);
        if(body.patch.email!==undefined) {
          const email=text(body.patch.email,'Email',254).toLowerCase();
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid email address.');
          // Auth Admin changes email directly, without a confirmation email flow.
          await result(admin.auth.admin.updateUserById(id,{email}), 'The email could not be updated. It may already be in use.');
        }
        if(body.patch.username!==undefined) await result(admin.from('profiles').update({username:body.patch.username.trim()}).eq('id',id), 'The display name could not be updated. An email change may already be saved; retry to complete the update.');
        return respond({user:(await summaries(client,[await userById(id)]))[0]});
      }
      if(body.action==='users.delete') {
        const user=await userById(id);
        if(body.confirm!==user.email) fail(400,'Type the user email to confirm deletion.');
        await result(client.rpc('admin_begin_user_deletion',{target:id}), 'This account cannot be deleted. You cannot delete yourself or the last administrator.');
        // A persisted reservation already denies app writes, even if Auth banning fails.
        await result(admin.auth.admin.updateUserById(id,{ban_duration:'876000h'}),'Account deletion is pending. Retry to complete the account freeze.');
        await removeFiles(admin,await files(admin,id));
        await result(admin.from('listings').delete().eq('owner_id',id),'Image cleanup completed, but listing cleanup failed. Retry deletion.');
        await result(admin.from('favorites').delete().eq('user_id',id),'Listing cleanup completed, but favorite cleanup failed. Retry deletion.');
        await result(admin.auth.admin.deleteUser(id),'Dependent cleanup completed, but Auth deletion failed. Retry deletion.');
        return respond({deleted:true});
      }
      if(['images.attach','images.remove','images.cleanup'].includes(body.action)) {
        const listing=await result(client.from('listings').select('id,owner_id,image_url').eq('id',id).single(),'This listing is unavailable.');
        if(body.action==='images.attach') {
          const key=text(body.key,'Image key',200);
          if(!new RegExp(`^${listing.owner_id}/${id}/[a-f0-9-]+\\.(jpg|png|webp)$`,'i').test(key)) fail(400,'The image must belong to this listing.');
          await result(client.from('listings').update({image_url:`${url}/storage/v1/object/public/${bucket}/${key}`}).eq('id',id).select('id').single(),'The image could not be attached. Upload it again or retry.');
        } else if(body.action==='images.remove') {
          await result(client.from('listings').update({image_url:null}).eq('id',id).select('id').single(),'The image could not be removed.');
        }
        return respond({updated:true,cleanupPending:await cleanupUnused(client,listing)});
      }
      fail(400,'Unsupported administrative action.');
    } catch(error) {
      return respond({error:error instanceof HttpError ? error.message : 'The administrative request failed. Please try again.'},error instanceof HttpError ? error.status : 500);
    }
  };
}
