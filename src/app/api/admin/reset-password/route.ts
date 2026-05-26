import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail } = body;

    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'userId and userEmail required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ 
        error: 'Server configuration error: Missing environment variables' 
      }, { status: 500 });
    }

    // Check if user is admin
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
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    // Use admin client to generate recovery link
    const adminSupabase = createAdminClient();
    // Prefer configured app URL, but ignore localhost values in production-like environments.
    const envAppUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    const envLooksLocal = /localhost|127\.0\.0\.1/i.test(envAppUrl);
    const appUrl = envAppUrl && !envLooksLocal
      ? envAppUrl
      : request.nextUrl.origin.replace(/\/$/, '');
    
    const { data, error } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: userEmail,
      options: {
        redirectTo: `${appUrl}/api/auth/callback`,
      },
    });

    if (error) {
      console.error('Password reset error:', error);
      return NextResponse.json({ 
        error: 'Failed to generate password reset link: ' + (error.message || String(error)) 
      }, { status: 500 });
    }

    const recoveryLink = data?.properties?.action_link;
    if (!recoveryLink) {
      return NextResponse.json({ 
        error: 'Failed to generate recovery link' 
      }, { status: 500 });
    }

    // Send email using SMTP
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
        to: userEmail,
        subject: 'Password Reset Request - AsiTeamLink',
        html: `
          <h2>Password Reset Request</h2>
          <p>You have requested to reset your password for AsiTeamLink.</p>
          <p>Click the link below to reset your password:</p>
          <p>
            <a href="${recoveryLink}" style="background-color: #3B82F6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p>Or copy this link: <code>${recoveryLink}</code></p>
          <p>This link will expire in 24 hours.</p>
          <hr />
          <p style="color: #666; font-size: 12px;">If you did not request this, please ignore this email.</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log('Password reset email sent to:', userEmail);

      return NextResponse.json({ 
        success: true, 
        message: 'Password reset email sent to ' + userEmail,
      });

    } catch (emailError: any) {
      console.error('SMTP error:', emailError);
      // Return the link anyway so admin can manually send it
      return NextResponse.json({ 
        success: false,
        warning: 'Could not send email via SMTP. Here is the recovery link instead:',
        actionLink: recoveryLink,
        message: `Manual recovery link generated for ${userEmail}. SMTP Error: ${emailError.message}`
      }, { status: 206 });
    }

  } catch (err: any) {
    const errorMsg = err?.message || String(err) || 'Unknown error';
    console.error('Reset password route error:', errorMsg, err);
    return NextResponse.json({ error: 'Server error: ' + errorMsg }, { status: 500 });
  }
}
