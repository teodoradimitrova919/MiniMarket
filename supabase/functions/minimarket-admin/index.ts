import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createAdminHandler } from './handler.js';

const url = Deno.env.get('SUPABASE_URL') || '';
if (url !== 'https://kkcfqkwkdcqvnurbdxus.supabase.co') throw new Error('MiniMarket project configuration mismatch');
const key = Deno.env.get('MINIMARKET_ADMIN_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
if (!key || !publicKey) throw new Error('Missing server configuration');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const origins = (Deno.env.get('MINIMARKET_ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://127.0.0.1:5180').split(',').map(value => value.trim()).filter(Boolean);
Deno.serve(createAdminHandler({ admin, url, origins,
  caller: token => createClient(url, publicKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } }),
}));
