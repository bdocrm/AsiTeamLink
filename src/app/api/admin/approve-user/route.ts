import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = String(body?.userId || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serverSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* noop */
        },
      },
    });

    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { error: statusErr } = await adminSupabase
      .from('users')
      .update({ status: 'approved' })
      .eq('id', userId);

    if (statusErr) {
      return NextResponse.json({ error: statusErr.message || 'Failed to approve user status' }, { status: 500 });
    }

    const { error: authErr } = await adminSupabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (authErr) {
      return NextResponse.json(
        {
          error: 'User status approved, but failed to confirm auth email',
          details: authErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

