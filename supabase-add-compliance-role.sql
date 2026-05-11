-- Add compliance role to users table CHECK constraint
-- First, drop the old constraint
ALTER TABLE users DROP CONSTRAINT users_role_check;

-- Add the new constraint with compliance role
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'manager', 'tl', 'agent', 'compliance'));
