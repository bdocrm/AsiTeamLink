-- Create a SECURITY DEFINER function to update user roles
-- This runs with the creator's permissions (bypasses RLS)

CREATE OR REPLACE FUNCTION update_user_role(user_email TEXT, new_role VARCHAR)
RETURNS TABLE (id UUID, email TEXT, role VARCHAR) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.users
  SET role = new_role
  WHERE email = user_email
  RETURNING users.id, users.email, users.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_role(TEXT, VARCHAR) TO authenticated;

-- Now use the function to update mackejercito01@gmail.com to admin
SELECT update_user_role('mackejercito01@gmail.com', 'admin');

-- Verify
SELECT id, email, role FROM public.users WHERE email = 'mackejercito01@gmail.com';
