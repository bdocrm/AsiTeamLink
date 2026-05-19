import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { announcement_id, emoji } = await req.json();
    if (!announcement_id || !emoji) return NextResponse.json({ error: 'announcement_id and emoji required' }, { status: 400 });

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
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only non-admins may react (agents + other non-admin roles)
    if (profile.role === 'admin') return NextResponse.json({ error: 'Admins cannot react' }, { status: 403 });

    const adminSupabase = createAdminClient();

    // Check if user already reacted with this emoji on this announcement
    const { data: existing, error: existingErr } = await adminSupabase.from('announcements_reactions').select('*').eq('announcement_id', announcement_id).eq('user_id', currentUser.id).eq('emoji', emoji).maybeSingle();
    if (existingErr) {
      console.error('Failed checking existing reaction:', existingErr);
      return NextResponse.json({ error: existingErr.message || 'DB error' }, { status: 500 });
    }

    if (existing) {
      // remove
      const { error: delErr } = await adminSupabase.from('announcements_reactions').delete().eq('id', existing.id);
      if (delErr) {
        console.error('Failed to delete reaction:', delErr);
        return NextResponse.json({ error: delErr.message || 'Failed to delete reaction' }, { status: 500 });
      }
    } else {
      // insert
      const { data: ins, error: insErr } = await adminSupabase.from('announcements_reactions').insert({ announcement_id, user_id: currentUser.id, emoji }).select().single();
      if (insErr) {
        console.error('Failed to insert reaction:', insErr);
        return NextResponse.json({ error: insErr.message || 'Failed to insert reaction' }, { status: 500 });
      }
    }

    // Return updated reactions for the announcement
    const { data: reactRows, error: reactErr } = await adminSupabase.from('announcements_reactions').select('*').eq('announcement_id', announcement_id);
    if (reactErr) {
      console.error('Failed to fetch reactions after toggle:', reactErr);
      return NextResponse.json({ error: reactErr.message || 'Failed to fetch reactions' }, { status: 500 });
    }

    const userIds = Array.from(new Set((reactRows || []).map((r: any) => r.user_id)));
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await adminSupabase.from('users').select('id,name').in('id', userIds as string[]);
      if (users) usersMap = (users as any[]).reduce((acc, u) => ({ ...acc, [u.id]: u }), {} as any);
    }

    const byEmoji: Record<string, any> = {};
    (reactRows || []).forEach((r: any) => {
      if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { emoji: r.emoji, users: [] };
      byEmoji[r.emoji].users.push({ id: r.user_id, name: usersMap[r.user_id]?.name || null });
    });

    return NextResponse.json({ data: Object.values(byEmoji) });
  } catch (err: any) {
    console.error('Unhandled announcements reaction POST error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
