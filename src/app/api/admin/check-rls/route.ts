import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Diagnostic endpoint to check RLS policies
 * GET /api/admin/check-rls
 */

export async function GET(request: NextRequest) {
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Use service role to check tables
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to read from each table
    const checks = {
      login_sessions: null as any,
      login_audit: null as any,
      mfa_codes: null as any,
    };

    // Check login_sessions
    const { data: sessions, error: sessionsError } = await serviceSupabase
      .from('login_sessions')
      .select('count', { count: 'exact' });

    checks.login_sessions = {
      accessible: !sessionsError,
      count: sessions?.length || 0,
      error: sessionsError?.message || 'OK',
    };

    // Check login_audit
    const { data: audit, error: auditError } = await serviceSupabase
      .from('login_audit')
      .select('count', { count: 'exact' });

    checks.login_audit = {
      accessible: !auditError,
      count: audit?.length || 0,
      error: auditError?.message || 'OK',
    };

    // Check mfa_codes
    const { data: mfa, error: mfaError } = await serviceSupabase
      .from('mfa_codes')
      .select('count', { count: 'exact' });

    checks.mfa_codes = {
      accessible: !mfaError,
      count: mfa?.length || 0,
      error: mfaError?.message || 'OK',
    };

    return NextResponse.json({
      status: 'diagnostic',
      timestamp: new Date().toISOString(),
      tables: checks,
      sqlToRun: `
-- Drop problematic policies
DROP POLICY IF EXISTS "Service role can manage all sessions" ON login_sessions;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON login_audit;
DROP POLICY IF EXISTS "Service role can manage all MFA codes" ON mfa_codes;

-- Add simpler service role access policies
CREATE POLICY "Service role full access login_sessions" ON login_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access login_audit" ON login_audit FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access mfa_codes" ON mfa_codes FOR ALL USING (true) WITH CHECK (true);
      `,
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
