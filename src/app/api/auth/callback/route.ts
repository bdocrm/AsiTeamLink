import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
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
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase configuration');
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
        // If this is a recovery link, redirect to password reset, otherwise go to login
        const typeParam = searchParams.get('type') || searchParams.get('action') || '';
        const isRecovery = typeof typeParam === 'string' && typeParam.toLowerCase().includes('recovery');
        const destination = isRecovery ? '/reset-password' : '/login';
        return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
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
