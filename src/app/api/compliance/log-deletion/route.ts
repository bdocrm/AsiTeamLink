import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityId, entityName, reason, permanent } = body;

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: 'entityType and entityId required' },
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

    console.log('[LOG-DELETION-API] Logging deletion:', {
      user: user.id,
      entityType,
      entityId,
      entityName,
      reason,
      permanent,
    });

    // Insert into deletion_audit_logs using admin client to bypass RLS
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('deletion_audit_logs')
      .insert({
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName || null,
        reason: reason || null,
        permanent: permanent || false,
        deleted_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('[LOG-DELETION-API] Error inserting:', error);
      return NextResponse.json(
        { error: 'Failed to log deletion: ' + error.message },
        { status: 500 }
      );
    }

    console.log('[LOG-DELETION-API] Deletion logged successfully:', data);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('[LOG-DELETION-API] Error:', err);
    return NextResponse.json(
      { error: 'Server error: ' + err.message },
      { status: 500 }
    );
  }
}
