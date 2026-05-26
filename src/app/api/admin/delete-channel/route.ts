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

    // Delete dependent rows first to avoid FK violations in projects
    // where FK constraints are not ON DELETE CASCADE.
    let channelMessageIds: string[] = [];
    try {
      const messageRowsRes = await adminSupabase.from('messages').select('id').eq('channel_id', channelId);
      if (messageRowsRes.error) {
        console.error('Failed to load channel messages for delete (supabase error):', messageRowsRes.error);
        return NextResponse.json({ error: messageRowsRes.error.message || 'Failed to load channel messages' }, { status: 500 });
      }
      channelMessageIds = (messageRowsRes.data || []).map((m: { id: string }) => m.id).filter(Boolean);
    } catch (e) {
      console.error('Exception while loading channel messages for delete:', e);
      return NextResponse.json({ error: 'Failed to load channel messages (exception)' }, { status: 500 });
    }

    // attachment_logs -> messages
    if (channelMessageIds.length > 0) {
      try {
        const delAttachmentLogsRes = await adminSupabase.from('attachment_logs').delete().in('message_id', channelMessageIds);
        if (delAttachmentLogsRes.error) {
          console.error('Failed to delete attachment logs (supabase error):', delAttachmentLogsRes.error);
          return NextResponse.json({ error: delAttachmentLogsRes.error.message || 'Failed to delete attachment logs' }, { status: 500 });
        }
      } catch (e) {
        console.error('Exception while deleting attachment logs:', e);
        return NextResponse.json({ error: 'Failed to delete attachment logs (exception)' }, { status: 500 });
      }

      try {
        const delAuditLogsRes = await adminSupabase.from('audit_logs').delete().in('message_id', channelMessageIds);
        if (delAuditLogsRes.error) {
          console.error('Failed to delete audit logs (supabase error):', delAuditLogsRes.error);
          return NextResponse.json({ error: delAuditLogsRes.error.message || 'Failed to delete audit logs' }, { status: 500 });
        }
      } catch (e) {
        console.error('Exception while deleting audit logs:', e);
        return NextResponse.json({ error: 'Failed to delete audit logs (exception)' }, { status: 500 });
      }
    }

    // channel_reads -> channels
    try {
      const delChannelReadsRes = await adminSupabase.from('channel_reads').delete().eq('channel_id', channelId);
      if (delChannelReadsRes.error) {
        console.error('Failed to delete channel reads (supabase error):', delChannelReadsRes.error);
        return NextResponse.json({ error: delChannelReadsRes.error.message || 'Failed to delete channel reads' }, { status: 500 });
      }
    } catch (e) {
      console.error('Exception while deleting channel reads:', e);
      return NextResponse.json({ error: 'Failed to delete channel reads (exception)' }, { status: 500 });
    }

    // file_audit_logs -> channels
    try {
      const delFileAuditLogsRes = await adminSupabase.from('file_audit_logs').delete().eq('channel_id', channelId);
      if (delFileAuditLogsRes.error) {
        console.error('Failed to delete file audit logs (supabase error):', delFileAuditLogsRes.error);
        return NextResponse.json({ error: delFileAuditLogsRes.error.message || 'Failed to delete file audit logs' }, { status: 500 });
      }
    } catch (e) {
      console.error('Exception while deleting file audit logs:', e);
      return NextResponse.json({ error: 'Failed to delete file audit logs (exception)' }, { status: 500 });
    }

    try {
      const delMessagesRes = await adminSupabase.from('messages').delete().eq('channel_id', channelId);
      if (delMessagesRes.error) {
        console.error('Failed to delete channel messages (supabase error):', delMessagesRes.error);
        return NextResponse.json({ error: delMessagesRes.error.message || 'Failed to delete channel messages' }, { status: 500 });
      }
    } catch (e) {
      console.error('Exception while deleting channel messages:', e);
      return NextResponse.json({ error: 'Failed to delete channel messages (exception)' }, { status: 500 });
    }

    try {
      const delMembersRes = await adminSupabase.from('channel_members').delete().eq('channel_id', channelId);
      if (delMembersRes.error) {
        console.error('Failed to delete channel members (supabase error):', delMembersRes.error);
        return NextResponse.json({ error: delMembersRes.error.message || 'Failed to delete channel members' }, { status: 500 });
      }
    } catch (e) {
      console.error('Exception while deleting channel members:', e);
      return NextResponse.json({ error: 'Failed to delete channel members (exception)' }, { status: 500 });
    }

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
