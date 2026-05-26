import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let campaignId = url.searchParams.get('campaign_id');
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
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

    const { data: { user: currentUser }, error: authErr } = await serverSupabase.auth.getUser();
    if (authErr || !currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await serverSupabase
      .from('users')
      .select('id,role,campaign_id,status')
      .eq('id', currentUser.id)
      .single();
    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdminOrCompliance = profile.role === 'admin' || profile.role === 'compliance';
    const sameCampaign = profile.campaign_id === campaignId;

    const adminSupabase = createAdminClient();
    const { data: membershipRows, error: membershipErr } = await adminSupabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', currentUser.id)
      .limit(500);
    if (membershipErr) {
      console.error('Failed to resolve channel membership for announcements GET:', membershipErr);
      return NextResponse.json({ error: 'Failed to validate access' }, { status: 500 });
    }
    const memberChannelIds = (membershipRows || []).map((r: any) => r.channel_id).filter(Boolean);
    let memberChannelIdsInCampaign: string[] = [];
    let hasChannelMembershipInCampaign = false;
    if (memberChannelIds.length > 0) {
      const { data: channelsInCampaign, error: channelsErr } = await adminSupabase
        .from('channels')
        .select('id')
        .eq('campaign_id', campaignId)
        .in('id', memberChannelIds as string[])
        .limit(500);
      if (channelsErr) {
        console.error('Failed to validate campaign membership for announcements GET:', channelsErr);
        return NextResponse.json({ error: 'Failed to validate access' }, { status: 500 });
      }
      memberChannelIdsInCampaign = (channelsInCampaign || []).map((c: any) => c.id).filter(Boolean);
      hasChannelMembershipInCampaign = memberChannelIdsInCampaign.length > 0;
    }

    if (!isAdminOrCompliance && !sameCampaign && !hasChannelMembershipInCampaign) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data: annData, error: annErr } = await adminSupabase
      .from('announcements')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (annErr) {
      console.error('Failed to load announcements:', annErr);
      return NextResponse.json({ error: annErr.message || 'Failed to load announcements' }, { status: 500 });
    }

    // Normalize older schemas that may use `content` instead of `body`.
    const rawAnnouncements = (annData || []).map((a: any) => ({ ...a, body: a.body ?? a.content }));
    const announcements = rawAnnouncements.filter((a: any) => {
      const scopedChannelId = a.channel_id || null;
      // Campaign-wide announcements are visible to campaign users.
      if (!scopedChannelId) return sameCampaign || isAdminOrCompliance;
      // Strict channel privacy: only channel members can view scoped announcements.
      // Admin/compliance keep oversight visibility.
      if (isAdminOrCompliance) return true;
      return memberChannelIdsInCampaign.includes(scopedChannelId);
    });

    // Load reactions for these announcements
    const annIds = announcements.map((a: any) => a.id).filter(Boolean);
    if (annIds.length === 0) return NextResponse.json({ data: announcements });

    const { data: reactRows, error: reactErr } = await adminSupabase.from('announcements_reactions').select('*').in('announcement_id', annIds as string[]);
    if (reactErr) {
      console.error('Failed to load announcement reactions:', reactErr);
      return NextResponse.json({ data: announcements });
    }
    const { data: readRows, error: readErr } = await adminSupabase
      .from('announcement_reads')
      .select('announcement_id,user_id')
      .in('announcement_id', annIds as string[]);
    if (readErr) {
      console.error('Failed to load announcement reads:', readErr);
    }

    // fetch user names for reactors
    // collect user ids for both reactors and announcers
    const reactorUserIds = Array.from(new Set((reactRows || []).map((r: any) => r.user_id)));
    const announcerIds = Array.from(new Set((announcements as any[]).map(a => a.created_by || a.author_id).filter(Boolean)));
    const userIds = Array.from(new Set([...reactorUserIds, ...announcerIds]));
    const scopedChannelIds = Array.from(new Set((announcements as any[]).map((a) => a.channel_id).filter(Boolean)));
    let usersMap: Record<string, { id: string; name?: string | null }> = {};
    let channelsMap: Record<string, { id: string; name?: string | null }> = {};
    if (userIds.length > 0) {
      const { data: users, error: usersErr } = await adminSupabase.from('users').select('id,name').in('id', userIds as string[]);
      if (!usersErr && users) {
        usersMap = (users as any[]).reduce((acc, u) => ({ ...acc, [u.id]: u }), {} as any);
      }
    }
    if (scopedChannelIds.length > 0) {
      const { data: channels } = await adminSupabase.from('channels').select('id,name').in('id', scopedChannelIds as string[]);
      if (channels) {
        channelsMap = (channels as any[]).reduce((acc, c) => ({ ...acc, [c.id]: c }), {} as any);
      }
    }

    const reactionsByAnnouncement: Record<string, any[]> = {};
    (reactRows || []).forEach((r: any) => {
      const list = reactionsByAnnouncement[r.announcement_id] || [];
      list.push({ emoji: r.emoji, user_id: r.user_id });
      reactionsByAnnouncement[r.announcement_id] = list;
    });
    const seenCountByAnnouncement: Record<string, number> = {};
    const isReadByAnnouncement: Record<string, boolean> = {};
    const seenNamesByAnnouncement: Record<string, string[]> = {};
    (readRows || []).forEach((r: any) => {
      seenCountByAnnouncement[r.announcement_id] = (seenCountByAnnouncement[r.announcement_id] || 0) + 1;
      if (r.user_id === currentUser.id) isReadByAnnouncement[r.announcement_id] = true;
      const n = usersMap[r.user_id]?.name || null;
      if (n) {
        if (!seenNamesByAnnouncement[r.announcement_id]) seenNamesByAnnouncement[r.announcement_id] = [];
        if (!seenNamesByAnnouncement[r.announcement_id].includes(n)) seenNamesByAnnouncement[r.announcement_id].push(n);
      }
    });

    const result = (announcements as any[]).map(a => {
      const rows = reactionsByAnnouncement[a.id] || [];
      const byEmoji: Record<string, { announcement_id: string; emoji: string; users: { id: string; name?: string | null }[] }> = {};
      rows.forEach((rr: any) => {
        if (!byEmoji[rr.emoji]) byEmoji[rr.emoji] = { announcement_id: a.id, emoji: rr.emoji, users: [] };
        byEmoji[rr.emoji].users.push({ id: rr.user_id, name: usersMap[rr.user_id]?.name || null });
      });
      const audienceLabel = a.channel_id ? (channelsMap[a.channel_id]?.name || 'Channel') : `All ${campaignId}`;
      return {
        ...a,
        audience_label: audienceLabel,
        reactions: Object.values(byEmoji),
        created_by_name: usersMap[a.created_by]?.name || usersMap[a.author_id]?.name || null,
        seen_count: seenCountByAnnouncement[a.id] || 0,
        is_read: !!isReadByAnnouncement[a.id],
        seen_by_names: (seenNamesByAnnouncement[a.id] || []).slice(0, 20),
      };
    });

    const pageRows = result.slice(offset, offset + limit);
    const hasMore = result.length > offset + limit;
    return NextResponse.json({
      data: pageRows,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
        total_visible: result.length,
      },
    });
  } catch (err: any) {
    console.error('Unhandled announcements GET error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    let campaign_id = payload?.campaign_id;
    const channel_id = payload?.channel_id || null;
    const title = payload?.title;
    // Accept either `body` or legacy `content` from callers / older DB schemas
    const body = payload?.body ?? payload?.content;
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

    const { data: { user: currentUser }, error: authErr } = await serverSupabase.auth.getUser();
    if (authErr) {
      console.error('Failed to resolve auth user for announcement POST:', authErr);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!currentUser?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('id,role').eq('id', currentUser.id).single();
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (profile.role !== 'admin' && profile.role !== 'tl' && profile.role !== 'manager') {
      return NextResponse.json({ error: 'Admin, Manager, or Team Lead required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    // Validate requested channel scope.
    if (channel_id) {
      const { data: channelRow, error: channelErr } = await adminSupabase
        .from('channels')
        .select('id,campaign_id')
        .eq('id', channel_id)
        .maybeSingle();
      if (channelErr || !channelRow) {
        return NextResponse.json({ error: 'Invalid channel scope' }, { status: 400 });
      }
      if (channelRow.campaign_id !== campaign_id) {
        return NextResponse.json({ error: 'Channel does not belong to selected campaign' }, { status: 400 });
      }
      if (profile.role !== 'admin') {
        const { data: memberRow, error: memberErr } = await adminSupabase
          .from('channel_members')
          .select('channel_id')
          .eq('channel_id', channel_id)
          .eq('user_id', currentUser.id)
          .maybeSingle();
        if (memberErr || !memberRow) {
          return NextResponse.json({ error: 'You are not a member of the selected channel' }, { status: 403 });
        }
      }
    }
    const authorId = currentUser.id || profile?.id || null;
    if (!authorId) {
      console.error('Announcement POST missing author id after auth/profile resolution', { hasCurrentUser: !!currentUser, hasProfile: !!profile });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('Creating announcement with admin client', { campaign_id, title: !!title, body_length: body?.length || 0, image_url: !!image_url, user_id: authorId, role: profile.role });
    // Insert both `body` and `content` to be compatible with DBs using either column name.
    // Insert both `body` and `content` and set both `created_by` and legacy `author_id` for compatibility
    const insertRes = await adminSupabase
      .from('announcements')
      .insert({ campaign_id, channel_id, title: title || null, body, content: body, created_by: authorId, author_id: authorId, image_url })
      .select()
      .single();
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

export async function DELETE(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const announcementId = payload?.id;
    if (!announcementId) return NextResponse.json({ error: 'id required' }, { status: 400 });

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

    const { data: { user: currentUser }, error: authErr } = await serverSupabase.auth.getUser();
    if (authErr || !currentUser?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('id,role').eq('id', currentUser.id).single();
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const adminSupabase = createAdminClient();
    const { error: delErr } = await adminSupabase.from('announcements').delete().eq('id', announcementId);
    if (delErr) {
      console.error('Failed to delete announcement:', delErr);
      return NextResponse.json({ error: delErr.message || 'Failed to delete announcement' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Unhandled announcements DELETE error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
