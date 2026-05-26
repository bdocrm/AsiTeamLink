import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';
import { confirmationEmail } from '@/lib/emailTemplates';

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function requireAdmin(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) };
  }

  const serverSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        /* noop */
      },
    },
  });

  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await serverSupabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin required' }, { status: 403 }) };
  }

  return { ok: true as const, adminUserId: user.id };
}

async function logAdminAction(params: {
  adminSupabase: any;
  adminUserId: string;
  targetUserId: string;
  action: string;
  success: boolean;
  reason?: string;
  request: NextRequest;
}) {
  const forwardedFor = params.request.headers.get('x-forwarded-for') || '';
  const ip = forwardedFor.split(',')[0]?.trim() || 'unknown';
  const ua = params.request.headers.get('user-agent') || 'unknown';
  await params.adminSupabase.from('login_audit').insert({
    user_id: params.adminUserId,
    ip_address: ip,
    device_name: 'Admin Panel',
    user_agent: ua,
    attempt_type: 'admin_action',
    success: params.success,
    reason: `${params.action}:${params.targetUserId}${params.reason ? `:${params.reason}` : ''}`,
  });
}

export async function GET(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if ('error' in adminCheck) return adminCheck.error;

    const userId = (request.nextUrl.searchParams.get('userId') || '').trim();
    const email = (request.nextUrl.searchParams.get('email') || '').trim().toLowerCase();
    if (!userId && !email) {
      return NextResponse.json({ error: 'userId or email is required' }, { status: 400 });
    }
    if (userId && !isUuid(userId)) {
      return NextResponse.json({ error: 'Invalid userId format (must be UUID)' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    let authUser: any = null;
    if (userId) {
      const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
      if (!error) {
        authUser = data?.user || null;
      }
    }

    if (!authUser && email) {
      const { data, error } = await adminSupabase.auth.admin.listUsers();
      if (error) {
        return NextResponse.json({ error: error.message || 'Failed to list auth users' }, { status: 500 });
      }
      authUser = (data?.users || []).find((u: any) => String(u.email || '').toLowerCase() === email) || null;
    }

    if (!authUser) {
      return NextResponse.json({ error: 'Auth user not found' }, { status: 404 });
    }

    const { data: publicUser, error: publicErr } = await adminSupabase
      .from('users')
      .select('id,email,name,role,status,campaign_id,mfa_enabled,mfa_method,created_at,updated_at,verification_sent_at,last_online_at,last_offline_at,muted_until,muted_reason')
      .eq('id', authUser.id)
      .maybeSingle();
    if (publicErr) {
      return NextResponse.json({ error: publicErr.message || 'Failed to fetch public user' }, { status: 500 });
    }

    const { data: resetReq } = await adminSupabase
      .from('password_reset_requests')
      .select('id,status,requested_at,resolved_at')
      .eq('user_id', authUser.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: activeSessions } = await adminSupabase
      .from('login_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .eq('is_active', true);

    const { data: lastAdminActionRow } = await adminSupabase
      .from('login_audit')
      .select('user_id,reason,success,created_at')
      .eq('attempt_type', 'admin_action')
      .ilike('reason', `%:${authUser.id}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let lastAdminActorEmail: string | null = null;
    const actorUserId = lastAdminActionRow?.user_id || null;
    if (actorUserId && isUuid(actorUserId)) {
      const { data: actorProfile } = await adminSupabase
        .from('users')
        .select('email')
        .eq('id', actorUserId)
        .maybeSingle();
      lastAdminActorEmail = actorProfile?.email || null;
    }

    const authEmailConfirmedAt = authUser.email_confirmed_at || authUser.confirmed_at || null;

    return NextResponse.json({
      success: true,
      health: {
        auth: {
          id: authUser.id,
          email: authUser.email || null,
          email_confirmed_at: authEmailConfirmedAt,
          last_sign_in_at: authUser.last_sign_in_at || null,
          created_at: authUser.created_at || null,
          banned_until: authUser.banned_until || null,
          deleted_at: authUser.deleted_at || null,
        },
        public: publicUser || null,
        checks: {
          has_public_profile: !!publicUser,
          email_matches: !!publicUser && String(publicUser.email || '').toLowerCase() === String(authUser.email || '').toLowerCase(),
          is_approved: publicUser?.status === 'approved',
          is_email_confirmed: !!authEmailConfirmedAt,
          is_banned: !!authUser.banned_until,
          has_active_session: (activeSessions || 0) > 0,
        },
        reset_request_latest: resetReq || null,
        active_session_count: activeSessions || 0,
        last_admin_action: lastAdminActionRow
          ? {
              actor_user_id: lastAdminActionRow.user_id || null,
              actor_email: lastAdminActorEmail,
              reason: lastAdminActionRow.reason || null,
              success: !!lastAdminActionRow.success,
              created_at: lastAdminActionRow.created_at || null,
            }
          : null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if ('error' in adminCheck) return adminCheck.error;
    const adminUserId = adminCheck.adminUserId;

    const body = await request.json();
    const action = String(body?.action || '').trim();
    const userId = String(body?.userId || '').trim();

    if (!action || !userId) {
      return NextResponse.json({ error: 'action and userId are required' }, { status: 400 });
    }
    if (!isUuid(userId)) {
      return NextResponse.json({ error: 'Invalid userId format (must be UUID)' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    if (action === 'confirm_email') {
      const { error } = await adminSupabase.auth.admin.updateUserById(userId, { email_confirm: true });
      if (error) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: error.message, request });
        return NextResponse.json({ error: error.message || 'Failed to confirm email' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true });
    }

    if (action === 'approve_and_confirm') {
      const { error: statusErr } = await adminSupabase.from('users').update({ status: 'approved' }).eq('id', userId);
      if (statusErr) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: statusErr.message, request });
        return NextResponse.json({ error: statusErr.message || 'Failed to approve user' }, { status: 500 });
      }
      const { error: authErr } = await adminSupabase.auth.admin.updateUserById(userId, { email_confirm: true });
      if (authErr) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: authErr.message, request });
        return NextResponse.json({ error: authErr.message || 'Failed to confirm email' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true });
    }

    if (action === 'force_signout_all') {
      const { error } = await adminSupabase
        .from('login_sessions')
        .update({ is_active: false, last_activity_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_active', true);
      if (error) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: error.message, request });
        return NextResponse.json({ error: error.message || 'Failed to invalidate sessions' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true });
    }

    if (action === 'resend_confirmation') {
      const { data: authData, error: authErr } = await adminSupabase.auth.admin.getUserById(userId);
      const authUser = authData?.user;
      if (authErr || !authUser?.email) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: authErr?.message || 'Auth user/email not found', request });
        return NextResponse.json({ error: authErr?.message || 'Auth user/email not found' }, { status: 500 });
      }

      const envAppUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
      const envLooksLocal = /localhost|127\.0\.0\.1/i.test(envAppUrl);
      const appUrl = envAppUrl && !envLooksLocal ? envAppUrl : request.nextUrl.origin.replace(/\/$/, '');
      const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
        type: 'signup',
        email: authUser.email,
        options: { redirectTo: `${appUrl}/api/auth/callback` },
      } as any);
      const verificationLink = linkData?.properties?.action_link;
      if (linkErr || !verificationLink) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: linkErr?.message || 'Failed to generate verification link', request });
        return NextResponse.json({ error: linkErr?.message || 'Failed to generate verification link' }, { status: 500 });
      }

      const host = process.env.SMTP_HOST;
      const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
      const secure = process.env.SMTP_SECURE === 'true';
      const userEnv = process.env.SMTP_USERNAME || process.env.SMTP_USER;
      const passEnv = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
      const fromName = process.env.SMTP_FROM_NAME || 'No Reply';
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME || process.env.SMTP_USER;
      if (!host || !port || !userEnv || !passEnv || !fromEmail) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: 'Missing SMTP configuration', request });
        return NextResponse.json({ error: 'Missing SMTP configuration' }, { status: 500 });
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: userEnv, pass: passEnv },
      });

      const { data: publicUser } = await adminSupabase
        .from('users')
        .select('name,email')
        .eq('id', userId)
        .maybeSingle();
      const mail = confirmationEmail({
        firstName: publicUser?.name || undefined,
        companyName: process.env.NEXT_PUBLIC_APP_NAME || 'Our Service',
        verificationLink,
        supportEmail: process.env.SUPPORT_EMAIL || undefined,
        expires: '24 hours',
      });

      await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: authUser.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      await adminSupabase.from('users').update({ verification_sent_at: new Date().toISOString() }).eq('id', userId);
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true });
    }

    if (action === 'timeout_30m') {
      const mutedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error } = await adminSupabase
        .from('users')
        .update({ muted_until: mutedUntil, muted_reason: 'Admin timeout (30m)' })
        .eq('id', userId);
      if (error) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: error.message, request });
        return NextResponse.json({ error: error.message || 'Failed to apply timeout' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true, muted_until: mutedUntil });
    }

    if (action === 'timeout_2h') {
      const mutedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { error } = await adminSupabase
        .from('users')
        .update({ muted_until: mutedUntil, muted_reason: 'Admin timeout (2h)' })
        .eq('id', userId);
      if (error) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: error.message, request });
        return NextResponse.json({ error: error.message || 'Failed to apply timeout' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true, muted_until: mutedUntil });
    }

    if (action === 'timeout_24h') {
      const mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error } = await adminSupabase
        .from('users')
        .update({ muted_until: mutedUntil, muted_reason: 'Admin timeout (24h)' })
        .eq('id', userId);
      if (error) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: error.message, request });
        return NextResponse.json({ error: error.message || 'Failed to apply timeout' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true, muted_until: mutedUntil });
    }

    if (action === 'unmute_user') {
      const { error } = await adminSupabase
        .from('users')
        .update({ muted_until: null, muted_reason: null })
        .eq('id', userId);
      if (error) {
        await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: false, reason: error.message, request });
        return NextResponse.json({ error: error.message || 'Failed to unmute user' }, { status: 500 });
      }
      await logAdminAction({ adminSupabase, adminUserId, targetUserId: userId, action, success: true, request });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
