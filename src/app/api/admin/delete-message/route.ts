import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { logDeletion, getClientIpAddress } from '@/lib/auditLogger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messageId = body?.messageId;
    console.log('Delete message request received. messageId:', messageId, 'body:', body);
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    console.log('Loading env vars - URL:', supabaseUrl?.substring(0, 30) + '...', 'Key:', supabaseAnonKey?.substring(0, 20) + '...');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing environment variables!', { hasUrl: !!supabaseUrl, hasKey: !!supabaseAnonKey });
      return NextResponse.json({ 
        error: 'Server configuration error: Missing environment variables. Please restart the development server.' 
      }, { status: 500 });
    }

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

    // Use the authenticated client to fetch and delete the message
    // Fetch the message to learn about any attachment
    const { data: message, error: msgErr } = await serverSupabase.from('messages').select('*').eq('id', messageId).maybeSingle();
    if (msgErr) {
      console.error('Message fetch error:', msgErr);
      return NextResponse.json({ error: 'Failed to fetch message: ' + (msgErr?.message || String(msgErr)) }, { status: 500 });
    }
    if (!message) {
      console.warn('Message not found or already deleted:', messageId);
      return NextResponse.json({ success: true, message: 'Message already deleted' });
    }

    console.log('Found message:', message.id, 'Attachment:', message.attachment_url);

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
            const { error: rmErr } = await serverSupabase.storage.from('attachments').remove([filePath]);
            if (rmErr) {
              console.warn('Failed to remove storage file', rmErr);
            } else {
              attachmentDeleted = true;
              console.log('Attachment deleted:', filePath);
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
    const { error: rpcErr } = await serverSupabase.rpc('admin_delete_message', { p_message_id: messageId });
    if (rpcErr) {
      console.warn('RPC admin_delete_message failed, fallback to direct delete:', rpcErr);
      const { error: delErr } = await serverSupabase.from('messages').delete().eq('id', messageId);
      if (delErr) {
        deleteErr = delErr;
        console.error('Direct delete also failed:', delErr);
      }
    }

    if (deleteErr) {
      const errorMsg = typeof deleteErr === 'string' ? deleteErr : deleteErr?.message || String(deleteErr);
      console.error('Message delete error:', errorMsg);
      return NextResponse.json({ error: 'Failed to delete message: ' + errorMsg }, { status: 500 });
    }

    // Log deletion to audit trail
    try {
      await logDeletion(
        serverSupabase,
        user.id,
        'message',
        messageId,
        message.text?.substring(0, 100),
        message.text ? 'Deleted via admin panel' : 'File deleted',
        true
      );
    } catch (logErr) {
      console.warn('Failed to log deletion:', logErr);
    }

    console.log('Message deleted successfully:', messageId);
    return NextResponse.json({ success: true, attachmentDeleted });
  } catch (err: any) {
    const errorMsg = err?.message || String(err) || 'Unknown error';
    console.error('admin delete route error:', errorMsg, err);
    return NextResponse.json({ error: 'Server error: ' + errorMsg }, { status: 500 });
  }
}
