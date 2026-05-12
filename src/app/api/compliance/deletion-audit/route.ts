import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Resolve user information from public.users or auth.users
 * First tries public.users (faster), then falls back to auth.users via service role
 */
async function resolveUsers(userIds: string[], supabase: any): Promise<Map<string, any>> {
  const userMap = new Map<string, any>();
  
  if (userIds.length === 0) return userMap;

  // Step 1: Try to get users from public.users
  try {
    const { data: publicUsers } = await supabase
      .from('users')
      .select('id, email, name')
      .in('id', userIds);
    
    if (publicUsers) {
      publicUsers.forEach((user: any) => {
        userMap.set(user.id, { email: user.email, name: user.name });
      });
    }
  } catch (err) {
    console.warn('[resolveUsers] Error querying public.users:', err);
  }

  // Step 2: For missing users, try to get from auth.users via RPC or direct query
  const missingUserIds = userIds.filter(id => !userMap.has(id));
  if (missingUserIds.length > 0) {
    try {
      // Query auth.users table directly (accessible via service role)
      const { data: authUsers, error } = await supabase.auth.admin.listUsers();
      
      if (!error && authUsers?.users) {
        authUsers.users.forEach((authUser: any) => {
          if (missingUserIds.includes(authUser.id)) {
            userMap.set(authUser.id, {
              email: authUser.email,
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Unknown',
            });
          }
        });
      }
    } catch (err) {
      console.warn('[resolveUsers] Error querying auth.users:', err);
    }
  }

  return userMap;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const entityType = searchParams.get('entityType');

    // Authenticate user
    const serverSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            /* noop */
          },
        },
      }
    );

    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin or compliance
    const { data: profile } = await serverSupabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'compliance'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Use service role for fetching all logs
    const supabase = createAdminClient();

    let query = supabase
      .from('deletion_audit_logs')
      .select(
        `
        id,
        user_id,
        entity_type,
        entity_id,
        entity_name,
        reason,
        permanent,
        deleted_at,
        created_at
      `
      )
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }

    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDateObj.toISOString());
    }

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    const { data, error } = await query.limit(1000);

    if (error) {
      console.error('[deletion-audit] Supabase query error:', JSON.stringify(error));
      return NextResponse.json(
        { error: 'Failed to fetch deletion audit logs', detail: error.message },
        { status: 500 }
      );
    }

    // Enrich with user data - try public.users and auth.users
    const logs = data || [];
    if (logs.length > 0) {
      const userIds = [...new Set(logs.map((l: any) => l.user_id).filter(Boolean))];
      const userMap = await resolveUsers(userIds, supabase);
      
      logs.forEach((log: any) => {
        const userData = userMap.get(log.user_id);
        log.users = userData ? { id: log.user_id, ...userData } : null;
      });
    }

    return NextResponse.json({ logs });
  } catch (err: any) {
    console.error('[deletion-audit] Unhandled error:', err?.message ?? err);
    return NextResponse.json(
      { error: 'Internal server error', detail: err?.message },
      { status: 500 }
    );
  }
}
