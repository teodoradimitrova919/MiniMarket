// Expose only the requested seller contact for an anonymously readable listing.
export function createListingOwnerHandler({ publicClient, admin, origins }) {
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-api-version' };
    if (origin && origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
    try {
      if (origin && !origins.includes(origin)) return respond({error:'This application origin is not allowed.'},403);
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
      if (request.method !== 'POST') return respond({error:'Use a POST request.'},405);
      const body = await request.json().catch(()=>null);
      if (!body || Array.isArray(body) || Object.keys(body).some(key=>key!=='listingId') || typeof body.listingId!=='string' || !uuid.test(body.listingId)) return respond({error:'Provide a valid listing ID.'},400);
      const listing = await publicClient.from('listings').select('owner_id').eq('id',body.listingId).maybeSingle();
      if (listing.error) return respond({error:'Seller contact details are unavailable.'},503);
      if (!listing.data) return respond({error:'This listing is unavailable.'},404);
      // Owner ID comes only from the RLS-visible listing, never the caller.
      const id = listing.data.owner_id;
      const [profile,account] = await Promise.all([
        admin.from('profiles').select('username').eq('id',id).maybeSingle(),
        admin.auth.admin.getUserById(id),
      ]);
      if (profile.error || account.error || !account.data?.user) return respond({error:'Seller contact details are unavailable.'},503);
      return respond({owner:{name:profile.data?.username || 'Seller',email:account.data.user.email || null}});
    } catch { return respond({error:'Seller contact details are unavailable.'},503); }
  };
}
