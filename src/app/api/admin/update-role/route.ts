import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, role } = body;

    console.log('=== Role Update API ===');
    console.log('Updating user:', userId, 'to role:', role);

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'userId and role required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();

    // Create Supabase client with the authenticated user's session
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

    // Verify requester is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('Not authenticated');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('User authenticated:', user.id);

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    console.log('User role:', profile?.role);

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Update the user's role using the authenticated admin session
    console.log('Performing update with admin session...');
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select();

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json(
        { error: `Update failed: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('Update successful:', data);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('Endpoint error:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
