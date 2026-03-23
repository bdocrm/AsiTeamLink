import { createClient } from '@supabase/supabase-js';

// Admin client using service role key — server-side only, bypasses RLS
export function createAdminClient() {
  // Prefer explicit SUPABASE_URL (server-side). Fallback to NEXT_PUBLIC_SUPABASE_URL.
  // Only use SUPABASE_POOLING_URL if it appears to be an HTTP URL; some pooling values
  // are postgres connection strings (postgresql://...) which are NOT valid here.
  const pooling = process.env.SUPABASE_POOLING_URL;
  if (pooling && !pooling.startsWith('http://') && !pooling.startsWith('https://')) {
    // Pooling value looks like a DB connection string; ignore for client URL use.
    console.warn('SUPABASE_POOLING_URL appears to be a DB connection string and will be ignored for HTTP client URL.');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || (pooling && (pooling.startsWith('http://') || pooling.startsWith('https://')) ? pooling : undefined);
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !(supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://'))) {
    throw new Error('Invalid or missing Supabase URL. Set SUPABASE_URL to your project URL (https://<project>.supabase.co) in your environment.');
  }
  if (!serviceRole) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment. Add your service role key to .env.local');
  }

  return createClient(
    supabaseUrl,
    serviceRole,
    {
      // Connection pooling configuration
      db: {
        schema: 'public',
      },
      // Disable automatic reauth to prevent connection issues
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
