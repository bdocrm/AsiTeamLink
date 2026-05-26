import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'name, email, and password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: existingRows, error: existingErr } = await adminSupabase
      .from('users')
      .select('id,email')
      .ilike('email', email)
      .limit(1);

    if (existingErr) {
      console.error('Failed checking existing user email:', existingErr);
      return NextResponse.json({ error: 'Failed to validate email' }, { status: 500 });
    }
    if (existingRows && existingRows.length > 0) {
      return NextResponse.json({ error: 'Email is already registered.' }, { status: 409 });
    }

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

    const { error: authError } = await serverSupabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
        data: { name },
      },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message || 'Registration failed' }, { status: 400 });
    }

    // App-level fallback: ensure a row exists in `public.users` (service role)
    try {
      const { data: authList, error: listErr } = await adminSupabase.auth.admin.listUsers();
      if (!listErr && authList?.users) {
        const authUser = authList.users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (authUser) {
          const userId = authUser.id;
          // Insert into public.users using service-role client (bypasses RLS)
          try {
            const { error: insertErr } = await adminSupabase
              .from('users')
              .insert({ id: userId, email, name, role: 'agent', status: 'pending' });
            if (insertErr) console.warn('Failed to insert public.users fallback:', insertErr);
          } catch (e) {
            console.warn('public.users insert exception:', e);
          }

          // Try to generate a verification link via admin API and email via send-confirmation
          try {
            const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
              type: 'signup',
              email,
              options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback` },
            } as any);

            const verificationLink = linkData?.properties?.action_link;
            if (verificationLink) {
              // Fire-and-forget call to internal send-confirmation route
              try {
                await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-confirmation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, verificationLink, firstName: name }),
                });
              } catch (e) {
                console.warn('Failed to call send-confirmation:', e);
              }
            } else if (linkErr) {
              console.warn('generateLink error (signup):', linkErr);
            }
          } catch (e) {
            console.warn('generateLink exception (signup):', e);
          }
        }
      }
    } catch (err) {
      console.warn('Auth admin lookup exception:', err);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Unhandled register API error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
