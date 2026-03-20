-- Make admin users standalone (not requiring a linked customer account)
-- This allows creating admin accounts with their own email/password credentials

-- Add email and name columns to admin_users for standalone admins
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS name TEXT;

-- Make user_id nullable (previously required)
ALTER TABLE admin_users
ALTER COLUMN user_id DROP NOT NULL;

-- Drop the existing unique constraint on user_id if it exists
ALTER TABLE admin_users
DROP CONSTRAINT IF EXISTS admin_users_user_id_key;

-- Add a partial unique index on user_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_user_id_unique 
ON admin_users(user_id) WHERE user_id IS NOT NULL;

-- Add unique constraint on email for standalone admins
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_unique 
ON admin_users(email) WHERE email IS NOT NULL;

-- Add a check constraint to ensure either user_id OR (email AND password_hash) exists
-- This ensures admins are either linked to a customer account OR have standalone credentials
ALTER TABLE admin_users
DROP CONSTRAINT IF EXISTS admin_users_valid_account;

ALTER TABLE admin_users
ADD CONSTRAINT admin_users_valid_account CHECK (
  user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL)
);

-- Add comments for documentation
COMMENT ON COLUMN admin_users.email IS 'Email for standalone admin accounts (null if linked to user)';
COMMENT ON COLUMN admin_users.name IS 'Name for standalone admin accounts (null if linked to user)';
COMMENT ON CONSTRAINT admin_users_valid_account ON admin_users IS 'Ensures admin has either a linked user account OR standalone email+password';

