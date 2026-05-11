import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { extractClientIp, createDeviceHash, parseDeviceName, isSessionValid } from '@/lib/deviceUtils';

/**
 * Adaptive MFA Login Flow
 * POST /api/auth/adaptive-login
 * 
 * Body: { action: 'check_device' | 'verify_otp' }
 * 
 * 1. check_device: Verify password and check if device is trusted
 *    - If trusted: Return login_success
 *    - If new: Return needs_otp, send OTP email
 * 
 * 2. verify_otp: Verify OTP code and create login session
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email, password, code } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
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

    // Service client for admin operations (logging, creating sessions)
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get('user-agent') || '';
    const deviceName = parseDeviceName(userAgent);
    const deviceHash = createDeviceHash(clientIp, userAgent);

    // ============ ACTION: Check Device Trust ============
    if (action === 'check_device') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
      }

      // Attempt password authentication
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        // Log failed password attempt
        await serviceSupabase.from('login_audit').insert({
          user_id: null,
          ip_address: clientIp,
          device_name: deviceName,
          user_agent: userAgent,
          attempt_type: 'password',
          success: false,
          reason: 'invalid_password',
        });

        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const userId = authData.user.id;

      // Log successful password attempt
      await serviceSupabase.from('login_audit').insert({
        user_id: userId,
        ip_address: clientIp,
        device_name: deviceName,
        user_agent: userAgent,
        attempt_type: 'password',
        success: true,
        reason: 'password_verified',
      });

      // Check if this device is trusted
      const { data: trustedSessions } = await serviceSupabase
        .from('login_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('device_hash', deviceHash)
        .eq('is_active', true)
        .order('last_activity_at', { ascending: false })
        .limit(1);

      const isTrustedDevice =
        trustedSessions &&
        trustedSessions.length > 0 &&
        isSessionValid(trustedSessions[0].last_activity_at);

      if (isTrustedDevice) {
        // Device is trusted - skip OTP
        // Update last activity
        await serviceSupabase
          .from('login_sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', trustedSessions[0].id);

        // Log trusted session
        await serviceSupabase.from('login_audit').insert({
          user_id: userId,
          ip_address: clientIp,
          device_name: deviceName,
          user_agent: userAgent,
          attempt_type: 'session_check',
          success: true,
          reason: 'trusted_device',
        });

        // Generate session token or keep auth session
        return NextResponse.json({
          success: true,
          result: 'login_success',
          message: 'Welcome back! Device recognized.',
        });
      } else {
        // New device/IP - require OTP
        // Generate 6-digit OTP code
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`Generated OTP for user ${userId}: ${otpCode}`);

        // Save OTP with 10-minute expiration
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await serviceSupabase.from('mfa_codes').insert({
          user_id: userId,
          code: otpCode,
          expires_at: expiresAt,
        });

        // Send OTP email
        try {
          console.log('Attempting to send OTP email...');
          console.log(`SMTP_HOST: ${process.env.SMTP_HOST}`);
          console.log(`SMTP_PORT: ${process.env.SMTP_PORT}`);
          console.log(`SMTP_SECURE: ${process.env.SMTP_SECURE}`);
          console.log(`SMTP_FROM_EMAIL: ${process.env.SMTP_FROM_EMAIL}`);

          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USERNAME,
              pass: process.env.SMTP_PASSWORD,
            },
          });

          console.log('Transporter created, fetching user profile...');
          const { data: userProfile, error: userError } = await serviceSupabase
            .from('users')
            .select('email, name')
            .eq('id', userId)
            .single();

          console.log('User profile fetch:', { userProfile, userError });

          if (userError) {
            console.error('User profile fetch error:', userError);
            throw new Error(`Failed to fetch user profile: ${userError.message}`);
          }

          if (!userProfile) {
            throw new Error('User profile not found');
          }

          console.log(`Sending OTP to ${userProfile.email}...`);
          const mailResult = await transporter.sendMail({
            from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
            to: userProfile.email,
            subject: 'Verify Your Login - AsiTeamLink',
            html: `
              <h2>New Device Login</h2>
              <p>Hi ${userProfile.name},</p>
              <p>We detected a login from a new device or IP address:</p>
              <p><strong>Device:</strong> ${deviceName}<br/>
              <strong>IP:</strong> ${clientIp}</p>
              <p>To complete your login, enter this verification code:</p>
              <h1 style="font-size: 32px; letter-spacing: 4px; text-align: center; margin: 20px 0;">
                ${otpCode}
              </h1>
              <p style="color: #666;">This code expires in 10 minutes.</p>
              <p><strong>If this wasn't you, you can safely ignore this email.</strong></p>
            `,
          });
          console.log('Email sent successfully:', mailResult);
        } catch (emailErr) {
          console.error('OTP email send error:', emailErr);
          console.error('Error details:', {
            message: (emailErr as any).message,
            code: (emailErr as any).code,
            command: (emailErr as any).command,
          });
          // Continue anyway - OTP was created, but log for debugging
        }

        // Log new device detection
        await serviceSupabase.from('login_audit').insert({
          user_id: userId,
          ip_address: clientIp,
          device_name: deviceName,
          user_agent: userAgent,
          attempt_type: 'session_check',
          success: false,
          reason: 'new_device',
        });

        return NextResponse.json({
          success: true,
          result: 'needs_otp',
          message: 'Verification code sent to your email',
          device_info: { device_name: deviceName, ip_address: clientIp },
        });
      }
    }

    // ============ ACTION: Verify OTP ============
    if (action === 'verify_otp') {
      if (!email || !body.otp || body.otp.length !== 6) {
        return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
      }

      // Get user by email (unauthenticated at this point)
      const { data: users } = await serviceSupabase
        .from('users')
        .select('id')
        .eq('email', email)
        .limit(1);

      if (!users || users.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const userId = users[0].id;

      // Verify the OTP code
      const { data: mfaCodes } = await serviceSupabase
        .from('mfa_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('code', body.otp)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!mfaCodes || mfaCodes.length === 0) {
        // Log failed OTP attempt
        await serviceSupabase.from('login_audit').insert({
          user_id: userId,
          ip_address: clientIp,
          device_name: deviceName,
          user_agent: userAgent,
          attempt_type: 'otp',
          success: false,
          reason: 'invalid_otp',
        });

        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }

      // Mark code as used
      await serviceSupabase
        .from('mfa_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', mfaCodes[0].id);

      // Create login session for this device
      const { error: sessionError } = await serviceSupabase.from('login_sessions').insert({
        user_id: userId,
        ip_address: clientIp,
        device_name: deviceName,
        user_agent: userAgent,
        device_hash: deviceHash,
        is_active: true,
        login_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      });

      if (sessionError) {
        console.error('Session creation error:', sessionError);
      }

      // Log successful OTP verification
      await serviceSupabase.from('login_audit').insert({
        user_id: userId,
        ip_address: clientIp,
        device_name: deviceName,
        user_agent: userAgent,
        attempt_type: 'otp',
        success: true,
        reason: 'otp_verified',
      });

      return NextResponse.json({
        success: true,
        result: 'login_success',
        message: 'Device verified. You can now access AsiTeamLink',
      });
    }

    // ============ ACTION: Resend OTP ============
    if (action === 'resend_otp') {
      if (!email) {
        return NextResponse.json({ error: 'Email required' }, { status: 400 });
      }

      // Get user by email
      const { data: users } = await serviceSupabase
        .from('users')
        .select('id, name, email')
        .eq('email', email)
        .limit(1);

      if (!users || users.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const userProfile = users[0];
      const userId = userProfile.id;

      // Generate new OTP code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`[Resend OTP] Generated new code for user ${userId}: ${otpCode}`);

      // Save OTP with 10-minute expiration
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await serviceSupabase.from('mfa_codes').insert({
        user_id: userId,
        code: otpCode,
        expires_at: expiresAt,
      });

      // Send OTP email
      try {
        console.log('[Resend OTP] Creating transporter...');
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD,
          },
        });

        console.log(`[Resend OTP] Sending code to ${userProfile.email}...`);
        const mailResult = await transporter.sendMail({
          from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
          to: userProfile.email,
          subject: 'Verification Code - AsiTeamLink',
          html: `
            <h2>Login Verification Code</h2>
            <p>Hi ${userProfile.name},</p>
            <p>Here's your new verification code:</p>
            <h1 style="font-size: 32px; letter-spacing: 4px; text-align: center; margin: 20px 0;">
              ${otpCode}
            </h1>
            <p style="color: #666;">This code expires in 10 minutes.</p>
          `,
        });
        console.log('[Resend OTP] Email sent:', mailResult);
      } catch (emailErr) {
        console.error('[Resend OTP] Email send error:', emailErr);
        console.error('Error details:', {
          message: (emailErr as any).message,
          code: (emailErr as any).code,
          command: (emailErr as any).command,
        });
        return NextResponse.json({ error: 'Failed to send email: ' + (emailErr as any).message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Verification code resent to your email',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Adaptive login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
