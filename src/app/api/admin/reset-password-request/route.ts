import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

// Generate a temporary random password
function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function POST(req: Request) {
  const { requestId, userId, manualPassword } = await req.json();

  if (!requestId || !userId) {
    return Response.json({ error: 'requestId and userId are required' }, { status: 400 });
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

    // Check if current user is admin
    const { data: { user: currentUser } } = await serverSupabase.auth.getUser();
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUserProfile } = await serverSupabase
      .from('users')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (!currentUserProfile || currentUserProfile.role !== 'admin') {
      return Response.json({ error: 'Only admins can reset passwords' }, { status: 403 });
    }

    // Verify the password reset request exists and is pending
    const { data: resetRequest, error: requestError } = await serverSupabase
      .from('password_reset_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (requestError || !resetRequest) {
      return Response.json({ error: 'Password reset request not found or already processed' }, { status: 404 });
    }

    // Use manual password if provided, otherwise generate temporary password
    const tempPassword = manualPassword && typeof manualPassword === 'string' && manualPassword.length > 0
      ? manualPassword
      : generateTemporaryPassword();

    // Use admin client to update the user's password
    const adminSupabase = createAdminClient();
    
    console.log('[PASSWORD_RESET] Attempting to update password for user:', userId);
    
    const { data: updatedUser, error: updateError } = await adminSupabase.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    );

    if (updateError) {
      console.error('Password update error:', JSON.stringify(updateError));
      return Response.json({ 
        error: updateError.message || 'Failed to update password',
        errorCode: updateError.code,
        errorStatus: updateError.status
      }, { status: 500 });
    }

    console.log('[PASSWORD_RESET] Password updated successfully for user:', userId);

    // Mark the request as completed
    const { error: completeError } = await serverSupabase
      .from('password_reset_requests')
      .update({
        status: 'completed',
        resolved_at: new Date().toISOString(),
        resolved_by: currentUser.id,
      })
      .eq('id', requestId);

    if (completeError) {
      console.error('Update request error:', completeError);
      return Response.json({ error: 'Password updated but failed to mark request as completed' }, { status: 500 });
    }

    console.log('[PASSWORD_RESET] Password reset completed for user:', userId, 'Request:', requestId);

    return Response.json({ 
      message: 'Password reset successfully',
      temporaryPassword: tempPassword,
      userId,
    }, { status: 200 });

  } catch (err) {
    console.error('Unhandled error resetting password:', err);
    return Response.json({ 
      error: 'Internal server error',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
