import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type PostingMode = 'all' | 'leaders_only' | 'admin_only';

export async function POST(req: Request) {
  try {
    const { channelId, postingMode } = await req.json();
    if (!channelId || !postingMode) {
      return NextResponse.json({ error: 'channelId and postingMode required' }, { status: 400 });
    }

    const allowed: PostingMode[] = ['all', 'leaders_only', 'admin_only'];
    if (!allowed.includes(postingMode)) {
      return NextResponse.json({ error: 'Invalid postingMode' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const serverSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* noop */ },
        },
      }
    );

    const { data: { user: currentUser } } = await serverSupabase.auth.getUser();
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('role').eq('id', currentUser.id).single();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    const { data: updated, error } = await adminSupabase
      .from('channels')
      .update({ posting_mode: postingMode })
      .eq('id', channelId)
      .select('id, name, posting_mode')
      .single();

    if (error) {
      console.error('Failed to update channel posting mode:', error);
      return NextResponse.json({ error: error.message || 'Failed to update posting mode' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    console.error('Unhandled update-channel-posting-mode error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
