import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Admin endpoint to fix RLS policies
 * POST /api/admin/fix-rls
 * Only accessible to admins
 */

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.delete(name);
        },
      },
    });

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if admin
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Apply RLS fixes using raw SQL
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // SQL statements to fix RLS
    const sqlStatements = [
      // Drop problematic policies
      `DROP POLICY IF EXISTS "Service role can manage all sessions" ON login_sessions`,
      `DROP POLICY IF EXISTS "Service role can insert audit logs" ON login_audit`,
      `DROP POLICY IF EXISTS "Service role can manage all MFA codes" ON mfa_codes`,

      // Add simpler service role access policies
      `CREATE POLICY "Service role full access login_sessions" ON login_sessions FOR ALL USING (true) WITH CHECK (true)`,
      `CREATE POLICY "Service role full access login_audit" ON login_audit FOR ALL USING (true) WITH CHECK (true)`,
      `CREATE POLICY "Service role full access mfa_codes" ON mfa_codes FOR ALL USING (true) WITH CHECK (true)`,
    ];

    // Unfortunately, Supabase doesn't have a direct SQL execution method for arbitrary SQL
    // Instead, we'll need to use a workaround or the user will need to run this manually
    // For now, let's return instructions

    return NextResponse.json({
      success: false,
      message: 'RLS policies cannot be fixed through API. Please run the following SQL in Supabase dashboard.',
      instructions: 'Go to: https://supabase.com/dashboard → Select your project → SQL Editor → New Query → Paste the SQL',
      sql: sqlStatements.join(';\n') + ';',
    });
  } catch (error) {
    console.error('RLS fix error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
