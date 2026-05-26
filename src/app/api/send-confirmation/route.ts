import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import nodemailer from 'nodemailer';
import { confirmationEmail } from '@/lib/emailTemplates';

const COOLDOWN_MINUTES = process.env.EMAIL_COOLDOWN_MINUTES ? Number(process.env.EMAIL_COOLDOWN_MINUTES) : 5; // default cooldown between sends

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId as string | undefined;
    const verificationLink = body?.verificationLink as string | undefined;
    const firstName = body?.firstName as string | undefined;

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    if (!verificationLink) return NextResponse.json({ error: 'verificationLink required' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Missing Supabase server config' }, { status: 500 });
    }

    const serverSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll() { /* noop */ },
      },
    });

    // Fetch user
    const { data: user, error: userErr } = await serverSupabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (userErr) return NextResponse.json({ error: 'Failed to lookup user' }, { status: 500 });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Rate limit based on verification_sent_at column
    const lastSent = user.verification_sent_at ? new Date(user.verification_sent_at) : null;
    if (lastSent) {
      const diff = (Date.now() - lastSent.getTime()) / 1000 / 60; // minutes
      if (diff < COOLDOWN_MINUTES) {
        return NextResponse.json({ error: 'Too many requests', retryAfterMinutes: COOLDOWN_MINUTES - Math.floor(diff) }, { status: 429 });
      }
    }

    // Prepare SMTP transport using env vars
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const secure = process.env.SMTP_SECURE === 'true';
    // Support both env naming styles used in this project.
    const userEnv = process.env.SMTP_USERNAME || process.env.SMTP_USER;
    const passEnv = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
    const fromName = process.env.SMTP_FROM_NAME || 'No Reply';
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME || process.env.SMTP_USER;

    if (!host || !port || !userEnv || !passEnv || !fromEmail) {
      return NextResponse.json({ error: 'Missing SMTP configuration' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: userEnv, pass: passEnv },
    });

    const mail = confirmationEmail({
      firstName: firstName || (user.name as string) || undefined,
      companyName: process.env.NEXT_PUBLIC_APP_NAME || 'Our Service',
      verificationLink,
      supportEmail: process.env.SUPPORT_EMAIL || undefined,
      expires: '24 hours',
    });

    const from = `${fromName} <${fromEmail}>`;

    // Send email
    let info: any = null;
    try {
      info = await transporter.sendMail({
        from,
        to: user.email as string,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } catch (sendErr: any) {
      console.error('SMTP send error:', sendErr);
      // Return detailed error to help debugging (temporary)
      return NextResponse.json({ error: 'SMTP send failed', details: sendErr?.message || String(sendErr) }, { status: 500 });
    }

    // Basic success check: nodemailer returns 'accepted' array on success
    const accepted = info?.accepted || [];
    const rejected = info?.rejected || [];
    if (!accepted || accepted.length === 0) {
      console.warn('SMTP send reported no accepted recipients', { accepted, rejected, info });
      return NextResponse.json({ error: 'SMTP reported failure', accepted, rejected, info }, { status: 500 });
    }

    // Update verification_sent_at on success
    const { error: updErr } = await serverSupabase.from('users').update({ verification_sent_at: new Date().toISOString() }).eq('id', userId);
    if (updErr) console.warn('Failed to update verification_sent_at', updErr);

    return NextResponse.json({ success: true, info, accepted, rejected });
  } catch (err: any) {
    console.error('send-confirmation route error', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

// Use default Node.js runtime (nodemailer requires Node APIs)
