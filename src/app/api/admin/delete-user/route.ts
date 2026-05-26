import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

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
    if (currentUser.id === userId) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

    const { data: profile } = await serverSupabase.from('users').select('role').eq('id', currentUser.id).single();
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const adminSupabase = createAdminClient();

    const tryDeleteAuthUser = async () => {
      const { error } = await adminSupabase.auth.admin.deleteUser(userId);
      return error;
    };

    // Clear direct auth.users references that may be NO ACTION (schema-dependent).
    try {
      await adminSupabase
        .from('password_reset_requests')
        .update({ resolved_by: null })
        .eq('resolved_by', userId);
    } catch {}

    let delErr = await tryDeleteAuthUser();
    if (delErr) {
      // Supabase auth delete commonly fails if user still owns storage objects.
      try {
        await adminSupabase.schema('storage').from('objects').delete().eq('owner', userId);
      } catch {}
      try {
        await adminSupabase.schema('storage').from('objects').delete().eq('owner_id', userId as any);
      } catch {}

      // Best-effort cleanup for schemas where some user references don't cascade.
      const deleteByUserIdTables = [
        'announcements_reactions',
        'message_reactions',
        'message_seen',
        'message_mentions',
        'channel_members',
        'login_sessions',
        'login_audit',
        'mfa_codes',
        'password_reset_requests',
      ];

      for (const table of deleteByUserIdTables) {
        try {
          await adminSupabase.from(table).delete().eq('user_id', userId);
        } catch (e) {
          // ignore missing tables / schema differences
        }
      }

      // Additional known columns
      try { await adminSupabase.from('channel_members').delete().eq('invited_by', userId); } catch {}
      try { await adminSupabase.from('announcements_reactions').delete().eq('user_id', userId); } catch {}
      try { await adminSupabase.from('announcements').delete().eq('created_by', userId); } catch {}
      try { await adminSupabase.from('announcements').delete().eq('author_id', userId); } catch {}
      try { await adminSupabase.from('password_reset_requests').update({ resolved_by: null }).eq('resolved_by', userId); } catch {}
      try { await adminSupabase.from('password_reset_requests').delete().eq('user_id', userId); } catch {}

      // Retry auth hard delete once after cleanup.
      delErr = await tryDeleteAuthUser();
      if (delErr) {
        // Final fallback: soft-delete auth user, then remove/deactivate app profile.
        const { error: softErr } = await adminSupabase.auth.admin.deleteUser(userId, true as any);
        if (softErr) {
          console.error('Failed deleting user after cleanup and soft-delete fallback:', softErr);
          return NextResponse.json({
            error: softErr.message || delErr.message || 'Failed to delete user',
            details: {
              code: (softErr as any)?.code || (delErr as any)?.code || null,
              status: (softErr as any)?.status || (delErr as any)?.status || null,
              name: (softErr as any)?.name || (delErr as any)?.name || null,
            },
          }, { status: 500 });
        }

        // Try removing from app users table; if constrained in this schema, deactivate instead.
        const { error: profileDeleteErr } = await adminSupabase.from('users').delete().eq('id', userId);
        if (profileDeleteErr) {
          const deletedEmail = `deleted+${userId}@local.invalid`;
          await adminSupabase
            .from('users')
            .update({
              status: 'rejected',
              role: 'agent',
              email: deletedEmail,
              name: 'Deleted User',
              campaign_id: null,
              is_online: false,
            } as any)
            .eq('id', userId);
        }

        return NextResponse.json({ success: true, mode: 'soft' });
      }
    }

    return NextResponse.json({ success: true, mode: 'hard' });
  } catch (err: any) {
    console.error('Unhandled delete-user error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
