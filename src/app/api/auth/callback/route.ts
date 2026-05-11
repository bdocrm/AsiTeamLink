import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  console.log('=== Auth Callback API ===');
  console.log('Code:', code ? 'Present' : 'Missing');
  console.log('Error:', error);

  // Handle errors
  if (error) {
    console.error('Auth error:', error_description);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error_description || error)}`,
        request.nextUrl.origin
      )
    );
  }

  // If code is provided, exchange it for a session
  if (code) {
    try {
      const supabase = createClient();
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      console.log('Exchange result:', {
        success: !!data.session,
        hasRefreshToken: !!data.session?.refresh_token,
        hasAccessToken: !!data.session?.access_token,
        error: exchangeError?.message,
      });

      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL(
            `/login?error=${encodeURIComponent(exchangeError.message)}`,
            request.nextUrl.origin
          )
        );
      }

      if (data.session) {
        console.log('✓ Session created successfully');
        // Redirect to password reset page since this is a recovery link
        return NextResponse.redirect(new URL('/reset-password', request.nextUrl.origin));
      }
    } catch (err: any) {
      console.error('Exchange exception:', err);
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(err?.message || 'Exchange failed')}`,
          request.nextUrl.origin
        )
      );
    }
  }

  // No code, redirect to login
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin));
}
