import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, fileName, fileSize, fileType, channelId, status, errorMessage } = body;

    if (!action || !fileName) {
      return NextResponse.json(
        { error: 'action and fileName required' },
        { status: 400 }
      );
    }

    // Authenticate user
    const serverSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            /* noop */
          },
        },
      }
    );

    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[LOG-FILE-OPERATION-API] Logging file operation:', {
      user: user.id,
      action,
      fileName,
      fileSize,
      fileType,
      channelId,
      status,
    });

    // Insert into file_audit_logs using admin client to bypass RLS
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('file_audit_logs')
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_size: fileSize || 0,
        file_type: fileType || null,
        action,
        channel_id: channelId || null,
        status: status || 'success',
        error_message: errorMessage || null,
      })
      .select();

    if (error) {
      console.error('[LOG-FILE-OPERATION-API] Error inserting:', error);
      return NextResponse.json(
        { error: 'Failed to log file operation: ' + error.message },
        { status: 500 }
      );
    }

    console.log('[LOG-FILE-OPERATION-API] File operation logged successfully:', data);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('[LOG-FILE-OPERATION-API] Error:', err);
    return NextResponse.json(
      { error: 'Server error: ' + err.message },
      { status: 500 }
    );
  }
}
