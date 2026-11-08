// Public read endpoint: callers supply attachment IDs, never bucket names or paths.
export function createAttachmentUrlHandler({publicClient,admin,origins,now=()=>Date.now()}){
  const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  return async request=>{
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-api-version'};
    if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    try{
      if(origin&&!origins.includes(origin))return respond({error:'This application origin is not allowed.'},403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(request.method!=='POST')return respond({error:'Use a POST request.'},405);
      const body=await request.json().catch(()=>null);
      if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['attachmentIds','download'].includes(key))||!Array.isArray(body.attachmentIds)||body.attachmentIds.length<1||body.attachmentIds.length>50||body.attachmentIds.some(id=>typeof id!=='string'||!uuid.test(id))||(body.download!==undefined&&typeof body.download!=='boolean'))return respond({error:'Provide between 1 and 50 valid attachment IDs.'},400);
      const ids=[...new Set(body.attachmentIds.map(id=>id.toLowerCase()))];
      // Anonymous RLS resolves public parent-listing access before privileged signing.
      const records=await publicClient.from('listing_attachments').select('id,storage_path,original_filename').in('id',ids);
      if(records.error)return respond({error:'Attachment links are unavailable. Please try again.'},503);
      if(!records.data.length)return respond({attachments:[]});
      const signed=await admin.storage.from('listing-attachments').createSignedUrls(records.data.map(row=>row.storage_path),300);
      if(signed.error)return respond({error:'Attachment links could not be generated.'},503);
      const byPath=new Map(signed.data.map(item=>[item.path,item]));
      const expiresAt=new Date(now()+300000).toISOString();
      return respond({attachments:records.data.flatMap(row=>{
        const item=byPath.get(row.storage_path);if(item?.error||!item?.signedUrl)return [];
        const url=new URL(item.signedUrl);
        if(body.download)url.searchParams.set('download',row.original_filename);
        return [{id:row.id,url:url.href,expiresAt}];
      })});
    }catch{return respond({error:'Attachment links are unavailable. Please try again.'},503);}
  };
}
