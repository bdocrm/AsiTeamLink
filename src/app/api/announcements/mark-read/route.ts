import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const campaignId = payload?.campaign_id as string | undefined;
    if (!campaignId) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });

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
    if (!currentUser?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();

    const { data: profile } = await adminSupabase
      .from('users')
      .select('id, role, campaign_id')
      .eq('id', currentUser.id)
      .single();
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: membershipRows } = await adminSupabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', currentUser.id)
      .limit(1000);
    const memberChannelIds = (membershipRows || []).map((r: { channel_id: string }) => r.channel_id).filter(Boolean);

    const { data: annRows, error: annErr } = await adminSupabase
      .from('announcements')
      .select('id, campaign_id, channel_id')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (annErr) return NextResponse.json({ error: annErr.message || 'Failed to load announcements' }, { status: 500 });

    const isAdminOrCompliance = profile.role === 'admin' || profile.role === 'compliance';
    const visibleIds = (annRows || [])
      .filter((a: { id: string; campaign_id: string; channel_id: string | null }) => {
        if (!a.channel_id) return profile.campaign_id === campaignId || isAdminOrCompliance;
        if (isAdminOrCompliance) return true;
        return memberChannelIds.includes(a.channel_id);
      })
      .map((a: { id: string }) => a.id);

    if (visibleIds.length === 0) return NextResponse.json({ success: true, count: 0 });

    const rows = visibleIds.map((announcementId) => ({
      announcement_id: announcementId,
      user_id: currentUser.id,
      read_at: new Date().toISOString(),
    }));

    const { error: insErr } = await adminSupabase
      .from('announcement_reads')
      .upsert(rows, { onConflict: 'announcement_id,user_id', ignoreDuplicates: false });
    if (insErr) return NextResponse.json({ error: insErr.message || 'Failed to mark announcements read' }, { status: 500 });

    return NextResponse.json({ success: true, count: visibleIds.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

