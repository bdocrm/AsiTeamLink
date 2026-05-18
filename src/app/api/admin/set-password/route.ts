import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return Response.json({ error: 'userId and password required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const serverSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (error) {
              console.error('Error setting cookies:', error);
            }
          },
        },
      }
    );

    // Check admin
    const { data: { user: currentUser } } = await serverSupabase.auth.getUser();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase.from('users').select('role').eq('id', currentUser.id).single();
    if (!profile || profile.role !== 'admin') {
      return Response.json({ error: 'Admin required' }, { status: 403 });
    }

    // Update password using admin client
    const adminSupabase = createAdminClient();
    const { data: updatedUser, error: updateError } = await adminSupabase.auth.admin.updateUserById(
      userId,
      { password }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return Response.json({ error: updateError.message || 'Failed to update password' }, { status: 500 });
    }

    return Response.json({ success: true, message: 'Password updated', userId });

  } catch (err: any) {
    console.error('Unhandled set-password error:', err);
    return Response.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
