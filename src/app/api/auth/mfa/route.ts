import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, code } = body; // action: 'enable', 'disable', 'verify'

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.delete(name);
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('email, mfa_enabled')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (action === 'enable') {
      // Generate 6-digit OTP code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Save OTP to database with 10-minute expiration
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { error: saveError } = await supabase
        .from('mfa_codes')
        .insert({
          user_id: user.id,
          code: otpCode,
          expires_at: expiresAt,
        });

      if (saveError) {
        console.error('Save MFA code error:', saveError);
        return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 });
      }

      // Send OTP via email
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD,
          },
        });

        const mailOptions = {
          from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
          to: profile.email,
          subject: 'Enable Two-Factor Authentication - AsiTeamLink',
          html: `
            <h2>Two-Factor Authentication Setup</h2>
            <p>You are enabling two-factor authentication for your AsiTeamLink account.</p>
            <p><strong>Your verification code is:</strong></p>
            <h1 style="font-size: 32px; letter-spacing: 4px; text-align: center; margin: 20px 0;">
              ${otpCode}
            </h1>
            <p>This code will expire in 10 minutes.</p>
            <p><strong>If you did not request this, please ignore this email.</strong></p>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log('MFA setup email sent to:', profile.email);

        return NextResponse.json({ 
          success: true, 
          message: 'Verification code sent to your email' 
        });
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
        return NextResponse.json(
          { error: 'Failed to send verification email' },
          { status: 500 }
        );
      }
    }

    if (action === 'verify') {
      if (!code || code.length !== 6) {
        return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
      }

      // Find and verify the OTP code
      const { data: mfaCodes } = await supabase
        .from('mfa_codes')
        .select('*')
        .eq('user_id', user.id)
        .eq('code', code)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (!mfaCodes || mfaCodes.length === 0) {
        return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
      }

      // Mark code as used
      await supabase
        .from('mfa_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', mfaCodes[0].id);

      // Enable MFA for user
      const { error: updateError } = await supabase
        .from('users')
        .update({ mfa_enabled: true, mfa_method: 'email' })
        .eq('id', user.id);

      if (updateError) {
        console.error('Enable MFA error:', updateError);
        return NextResponse.json({ error: 'Failed to enable MFA' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Two-factor authentication enabled successfully' 
      });
    }

    if (action === 'disable') {
      // Disable MFA for user
      const { error: updateError } = await supabase
        .from('users')
        .update({ mfa_enabled: false })
        .eq('id', user.id);

      if (updateError) {
        console.error('Disable MFA error:', updateError);
        return NextResponse.json({ error: 'Failed to disable MFA' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Two-factor authentication disabled' 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('MFA endpoint error:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
