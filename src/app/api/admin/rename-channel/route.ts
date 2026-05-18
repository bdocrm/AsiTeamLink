import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { channelId, newName } = await req.json();
    if (!channelId || !newName) return NextResponse.json({ error: 'channelId and newName required' }, { status: 400 });

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

    // Fetch existing channel name
    const { data: existing, error: fetchErr } = await adminSupabase.from('channels').select('name').eq('id', channelId).single();
    if (fetchErr) {
      console.error('Failed to load channel for rename:', fetchErr);
      return NextResponse.json({ error: 'Failed to load channel' }, { status: 500 });
    }
    const oldName = existing?.name || null;

    // Update channel
    const { data: updated, error: updateErr } = await adminSupabase.from('channels').update({ name: newName.trim() }).eq('id', channelId).select();
    if (updateErr) {
      console.error('Failed to update channel name:', updateErr);
      return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 });
    }

    // Log audit entry in channel_rename_logs table
    try {
      const ip = (req.headers && (req.headers as any).get ? (req.headers as any).get('x-forwarded-for') || (req.headers as any).get('x-real-ip') : null) || null;
      const { data: auditData, error: auditErr } = await adminSupabase.from('channel_rename_logs').insert({
        channel_id: channelId,
        old_name: oldName,
        new_name: newName.trim(),
        user_id: currentUser.id,
        ip_address: ip,
        meta: null,
      }).select();
      if (auditErr) console.error('Failed to insert rename audit log:', auditErr);
    } catch (err) {
      console.error('Audit logging error:', err);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('Unhandled rename-channel error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
