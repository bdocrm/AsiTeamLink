import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email || !email.trim()) {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
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

    // Get admin client to access auth.admin API
    const adminSupabase = createAdminClient();

    // Get the user's ID from their email using admin API
    const { data: users, error: authError } = await adminSupabase.auth.admin.listUsers();
    
    if (authError || !users) {
      console.error('List users error:', authError);
      return Response.json({ 
        message: 'If an account exists with that email, a password reset request has been sent to the admin.' 
      }, { status: 200 });
    }

    // Find user by email
    const authUser = users.users.find(u => u.email === email);
    
    if (!authUser) {
      // Don't reveal whether the email exists (security best practice)
      return Response.json({ 
        message: 'If an account exists with that email, a password reset request has been sent to the admin.' 
      }, { status: 200 });
    }

    // Check if there's already a pending request for this user (use admin client to bypass RLS)
    const { data: existingRequest, error: checkError } = await adminSupabase
      .from('password_reset_requests')
      .select('id, status')
      .eq('user_id', authUser.id)
      .eq('status', 'pending')
      .single();

    if (!checkError && existingRequest) {
      // Already has a pending request
      return Response.json({ 
        message: 'You already have a pending password reset request. Please wait for admin response.' 
      }, { status: 200 });
    }

    // Create a new password reset request (use admin client to bypass RLS)
    console.log('[PASSWORD_RESET] About to insert for user_id:', authUser.id);
    
    const { data: resetRequest, error: insertError } = await adminSupabase
      .from('password_reset_requests')
      .insert({
        user_id: authUser.id,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[PASSWORD_RESET] Insert error:', JSON.stringify(insertError, null, 2));
      return Response.json({ 
        error: 'Failed to create password reset request',
        details: insertError.message 
      }, { status: 500 });
    }

    console.log('[PASSWORD_RESET] Request created successfully:', resetRequest.id);

    return Response.json({ 
      message: 'Password reset request submitted successfully. Please wait for admin to process.',
      requestId: resetRequest.id 
    }, { status: 200 });

  } catch (err) {
    console.error('Unhandled error creating password reset request:', err);
    return Response.json({ 
      error: 'Internal server error',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
