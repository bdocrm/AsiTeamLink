import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let campaignId = url.searchParams.get('campaign_id');
    if (!campaignId) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
    // Allow callers to pass a channel-like id (e.g. "announcements:<uuid>")
    if (campaignId.includes(':')) campaignId = campaignId.split(':').pop() || campaignId;

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

    const { data: annData, error: annErr } = await serverSupabase.from('announcements').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false });
    if (annErr) {
      console.error('Failed to load announcements:', annErr);
      return NextResponse.json({ error: annErr.message || 'Failed to load announcements' }, { status: 500 });
    }

    const announcements = annData || [];

    // Load reactions for these announcements
    const annIds = announcements.map((a: any) => a.id).filter(Boolean);
    if (annIds.length === 0) return NextResponse.json({ data: announcements });

    const { data: reactRows, error: reactErr } = await serverSupabase.from('announcements_reactions').select('*').in('announcement_id', annIds as string[]);
    if (reactErr) {
      console.error('Failed to load announcement reactions:', reactErr);
      return NextResponse.json({ data: announcements });
    }

    // fetch user names for reactors
    // collect user ids for both reactors and announcers
    const reactorUserIds = Array.from(new Set((reactRows || []).map((r: any) => r.user_id)));
    const announcerIds = Array.from(new Set((announcements as any[]).map(a => a.created_by).filter(Boolean)));
    const userIds = Array.from(new Set([...reactorUserIds, ...announcerIds]));
    let usersMap: Record<string, { id: string; name?: string | null }> = {};
    if (userIds.length > 0) {
      const { data: users, error: usersErr } = await serverSupabase.from('users').select('id,name').in('id', userIds as string[]);
      if (!usersErr && users) {
        usersMap = (users as any[]).reduce((acc, u) => ({ ...acc, [u.id]: u }), {} as any);
      }
    }

    const reactionsByAnnouncement: Record<string, any[]> = {};
    (reactRows || []).forEach((r: any) => {
      const list = reactionsByAnnouncement[r.announcement_id] || [];
      list.push({ emoji: r.emoji, user_id: r.user_id });
      reactionsByAnnouncement[r.announcement_id] = list;
    });

    const result = (announcements as any[]).map(a => {
      const rows = reactionsByAnnouncement[a.id] || [];
      const byEmoji: Record<string, { announcement_id: string; emoji: string; users: { id: string; name?: string | null }[] }> = {};
      rows.forEach((rr: any) => {
        if (!byEmoji[rr.emoji]) byEmoji[rr.emoji] = { announcement_id: a.id, emoji: rr.emoji, users: [] };
        byEmoji[rr.emoji].users.push({ id: rr.user_id, name: usersMap[rr.user_id]?.name || null });
      });
      return { ...a, reactions: Object.values(byEmoji), created_by_name: usersMap[a.created_by]?.name || null };
    });

    return NextResponse.json({ data: result });
  } catch (err: any) {
    console.error('Unhandled announcements GET error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    let campaign_id = payload?.campaign_id;
    const title = payload?.title;
    const body = payload?.body;
    const image_url = payload?.image_url || null;
    if (!campaign_id || !body) return NextResponse.json({ error: 'campaign_id and body required' }, { status: 400 });
    // Normalize channel-style ids like "announcements:<uuid>"
    if (typeof campaign_id === 'string' && campaign_id.includes(':')) campaign_id = campaign_id.split(':').pop();

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

    if (profile.role !== 'admin' && profile.role !== 'tl') {
      return NextResponse.json({ error: 'Admin or Team Lead required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    console.log('Creating announcement with admin client', { campaign_id, title: !!title, body_length: body?.length || 0, image_url: !!image_url, user_id: currentUser.id, role: profile.role });
    const insertRes = await adminSupabase.from('announcements').insert({ campaign_id, title: title || null, body, created_by: currentUser.id, image_url }).select().single();
    if (insertRes.error) {
      console.error('Failed to insert announcement:', insertRes.error);
      try {
        console.error('Insert response full debug:', JSON.stringify(insertRes, Object.getOwnPropertyNames(insertRes)));
      } catch (e) {
        console.error('Could not stringify insertRes for debug');
      }
      return NextResponse.json({ error: insertRes.error.message || 'Failed to create announcement' }, { status: 500 });
    }

    return NextResponse.json({ data: insertRes.data });
  } catch (err: any) {
    console.error('Unhandled announcements POST error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
