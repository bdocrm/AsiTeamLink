import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return Response.json(
      { error: 'Email and password required' },
      { status: 400 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    // First, try to get the user by email
    const { data: users, error: listError } = await adminSupabase.auth.admin.listUsers();

    if (listError || !users) {
      console.error('[RESET_ADMIN_PASSWORD] Error listing users:', listError);
      return Response.json(
        { error: 'Failed to list users' },
        { status: 500 }
      );
    }

    // Find the user by email
    const user = users.users.find(u => u.email === email);

    if (!user) {
      console.error('[RESET_ADMIN_PASSWORD] User not found:', email);
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update the password
    const { data: updatedUser, error: updateError } = await adminSupabase.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (updateError || !updatedUser.user) {
      console.error('[RESET_ADMIN_PASSWORD] Error updating password:', updateError);
      return Response.json(
        { error: updateError?.message || 'Failed to update password' },
        { status: 500 }
      );
    }

    console.log('[RESET_ADMIN_PASSWORD] Password reset successfully for:', email);

    return Response.json({
      success: true,
      message: 'Password reset successfully',
      userId: updatedUser.user.id,
      email: updatedUser.user.email,
    });
  } catch (err) {
    console.error('[RESET_ADMIN_PASSWORD] Unhandled error:', err);
    return Response.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
