// scripts/delete-channel.js
// Usage: set environment variables and run with Node (Node 16+ supports ESM if package.json type=module).
// Example (Windows PowerShell):
//   $env:NEXT_PUBLIC_SUPABASE_URL='https://<project>.supabase.co'; $env:SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'; node scripts/delete-channel.js

import pkg from '@supabase/supabase-js';
const { createClient } = pkg;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !serviceRole) {
  console.error('Missing SUPABASE url or service role key in env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRole);

async function run() {
  const channelId = process.argv[2] || '<CHANNEL_ID>'; // pass id as first arg
  if (!channelId || channelId === '<CHANNEL_ID>') {
    console.error('Please provide channel id as first argument: node scripts/delete-channel.js <CHANNEL_ID>');
    process.exit(1);
  }
  const { data, error } = await supabase.from('channels').delete().eq('id', channelId).select();
  console.log('supabase response:', { error, data });
}

run().catch(e => { console.error(e); process.exit(1); });
