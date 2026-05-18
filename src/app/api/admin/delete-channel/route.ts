import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { channelId, reason, permanent } = await req.json();
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

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

    // fetch existing channel for name and related meta
    let existing: any = null;
    try {
      const fetchRes = await adminSupabase.from('channels').select('name').eq('id', channelId).maybeSingle();
      existing = fetchRes.data;
      if (fetchRes.error) {
        console.error('Failed to load channel for delete (supabase error):', fetchRes.error);
        return NextResponse.json({ error: fetchRes.error.message || 'Failed to load channel' }, { status: 500 });
      }
      if (!existing) {
        console.warn('Channel not found for id:', channelId);
        return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
      }
    } catch (e) {
      console.error('Exception while loading channel for delete:', e);
      return NextResponse.json({ error: 'Failed to load channel (exception)' }, { status: 500 });
    }

    const oldName = existing?.name || null;

    // delete channel
    try {
      const delRes = await adminSupabase.from('channels').delete().eq('id', channelId);
      if (delRes.error) {
        console.error('Failed to delete channel (supabase error):', delRes.error);
        return NextResponse.json({ error: delRes.error.message || 'Failed to delete channel' }, { status: 500 });
      }
    } catch (e) {
      console.error('Exception while deleting channel:', e);
      return NextResponse.json({ error: 'Failed to delete channel (exception)' }, { status: 500 });
    }

    // log deletion in deletion_audit_logs
    try {
      const ip = (req.headers && (req.headers as any).get ? (req.headers as any).get('x-forwarded-for') || (req.headers as any).get('x-real-ip') : null) || null;
      const { error: auditErr } = await adminSupabase.from('deletion_audit_logs').insert({
        user_id: currentUser.id,
        entity_type: 'channel',
        entity_id: channelId,
        entity_name: oldName,
        reason: reason || null,
        permanent: !!permanent,
        deleted_at: new Date().toISOString(),
      });
      if (auditErr) console.error('Failed to insert deletion audit log:', auditErr);
    } catch (err) {
      console.error('Audit logging error:', err);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Unhandled delete-channel error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
