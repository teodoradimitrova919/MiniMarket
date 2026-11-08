import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishableKey) {
  throw new Error(
    'MiniMarket: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example), then restart Vite.',
  );
}
if (!publishableKey.startsWith('sb_publishable_')) {
  throw new Error('MiniMarket: use a Supabase publishable key. Secret and service-role keys must never be used in the browser.');
}

let projectUrl;
try {
  projectUrl = new URL(url);
} catch {
  throw new Error('MiniMarket: VITE_SUPABASE_URL must be a valid project base URL.');
}
if (!['https:', 'http:'].includes(projectUrl.protocol) || !['', '/'].includes(projectUrl.pathname) || projectUrl.search || projectUrl.hash || projectUrl.username || projectUrl.password) {
  throw new Error('MiniMarket: VITE_SUPABASE_URL must be a project base URL without an API path, query, or credentials.');
}

// ES module imports share this single client instance.
export const supabase = createClient(url, publishableKey);
