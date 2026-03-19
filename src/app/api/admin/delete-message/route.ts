import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messageId = body?.messageId;
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const serverSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* noop for this route */
        },
      },
    });

    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const admin = createAdminClient();

    // Fetch the message to learn about any attachment
    const { data: message, error: msgErr } = await admin.from('messages').select('*').eq('id', messageId).single();
    if (msgErr || !message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

    // Attempt to remove attachment from storage if present and looks like a bucket URL
    let attachmentDeleted = false;
    try {
      const attachmentUrl = message.attachment_url as string | null;
      if (attachmentUrl) {
        try {
          const url = new URL(attachmentUrl);
          let filePath: string | null = null;
          const idx = url.pathname.indexOf('/attachments/');
          if (idx >= 0) {
            filePath = decodeURIComponent(url.pathname.slice(idx + '/attachments/'.length));
          } else {
            const parts = url.pathname.split('/');
            const bIdx = parts.indexOf('attachments');
            if (bIdx >= 0) filePath = parts.slice(bIdx + 1).join('/');
          }

          if (filePath) {
            const { error: rmErr } = await admin.storage.from('attachments').remove([filePath]);
            if (rmErr) {
              console.warn('Failed to remove storage file', rmErr);
            } else {
              attachmentDeleted = true;
            }
          } else {
            console.warn('Could not determine storage path from URL', attachmentUrl);
          }
        } catch (e) {
          console.warn('Invalid attachment URL', e);
        }
      }
    } catch (e) {
      console.error('Attachment deletion error', e);
    }

    // Delete message row (try RPC then fallback to direct delete)
    let deleteErr: any = null;
    const { error: rpcErr } = await admin.rpc('admin_delete_message', { p_message_id: messageId });
    if (rpcErr) {
      const { error: delErr } = await admin.from('messages').delete().eq('id', messageId);
      if (delErr) deleteErr = delErr;
    }

    if (deleteErr) return NextResponse.json({ error: 'Failed to delete message: ' + deleteErr.message }, { status: 500 });

    return NextResponse.json({ success: true, attachmentDeleted });
  } catch (err) {
    console.error('admin delete route error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
