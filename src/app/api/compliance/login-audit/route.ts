import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Login Audit API
 * GET /api/compliance/login-audit
 * 
 * Returns login attempts for all users (compliance/admin only)
 * Query params:
 *   - userId: Filter by specific user
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 *   - limit: Number of records (default 100)
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

    // Check if user is compliance or admin
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['compliance', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build query - simple select without joins
    let query = serviceSupabase
      .from('login_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('Fetch login audit error:', error);
      return NextResponse.json({ error: 'Failed to fetch audit logs', details: error.message }, { status: 500 });
    }

    // Get user info for all logs
    if (logs && logs.length > 0) {
      const userIds = [...new Set(logs.map((l: any) => l.user_id))];
      
      try {
        const { data: users, error: usersError } = await serviceSupabase
          .from('users')
          .select('id, email, name')
          .in('id', userIds);

        if (usersError) {
          console.warn('Failed to fetch user info:', usersError);
          // Return logs with default user values if user fetch fails
          const enrichedLogs = logs.map((log: any) => ({
            ...log,
            users: { id: log.user_id, email: 'Unknown', name: 'Unknown' },
          }));
          return NextResponse.json({ success: true, logs: enrichedLogs });
        }

        const userMap = new Map(users?.map((u: any) => [u.id, u]) || []);

        // Enrich logs with user info
        const enrichedLogs = logs.map((log: any) => ({
          ...log,
          users: userMap.get(log.user_id) || { id: log.user_id, email: 'Unknown', name: 'Unknown' },
        }));

        return NextResponse.json({ success: true, logs: enrichedLogs });
      } catch (userFetchError) {
        console.warn('Error enriching user data:', userFetchError);
        // Return logs with default user values if something goes wrong
        const enrichedLogs = logs.map((log: any) => ({
          ...log,
          users: { id: log.user_id, email: 'Unknown', name: 'Unknown' },
        }));
        return NextResponse.json({ success: true, logs: enrichedLogs });
      }
    }

    return NextResponse.json({ success: true, logs: logs || [] });
  } catch (error) {
    console.error('Login audit API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
