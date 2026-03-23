export function logEnvHealth() {
  const vars = {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.SUPABASE_POOLING_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_POOLING_URL: process.env.SUPABASE_POOLING_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };

  // Log a concise summary (do not print secrets)
  console.info('Env health:', {
    SUPABASE_URL: vars.SUPABASE_URL ? 'SET' : 'MISSING',
    SUPABASE_POOLING_URL: vars.SUPABASE_POOLING_URL ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: vars.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: vars.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
  });

  return vars;
}
