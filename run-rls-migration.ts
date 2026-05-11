import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

async function runMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read the SQL file
  const sql = fs.readFileSync('./supabase-fix-rls.sql', 'utf-8');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));

  console.log(`Executing ${statements.length} SQL statements...`);

  for (const statement of statements) {
    try {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      const { error } = await supabase.rpc('exec', { sql: statement });
      if (error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.log('✓ Success');
      }
    } catch (err: any) {
      console.error(`Execution error: ${err.message}`);
    }
  }
}

runMigration();
