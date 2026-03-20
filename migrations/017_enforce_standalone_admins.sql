-- Enforce standalone-only admin accounts
-- This migration ensures complete separation between customer and admin accounts

-- Step 1: Delete any existing linked admins (admins with user_id IS NOT NULL)
-- These must be recreated as standalone admins with their own passwords
-- Note: Linked admins used their customer account password, which cannot be migrated
-- to standalone admin password (different password hashes, different auth system)
DELETE FROM admin_users WHERE user_id IS NOT NULL;

-- Log what was deleted (optional - for information only)
-- If you need to preserve admin roles, manually record them before running this migration

-- Step 2: Drop the old check constraint that allowed either user_id OR email+password
ALTER TABLE admin_users
DROP CONSTRAINT IF EXISTS admin_users_valid_account;

-- Step 3: Add new constraint requiring user_id to be NULL (standalone only)
ALTER TABLE admin_users
ADD CONSTRAINT admin_users_standalone_only CHECK (user_id IS NULL);

-- Step 4: Ensure email and name are always present for standalone admins
ALTER TABLE admin_users
ADD CONSTRAINT admin_users_required_fields CHECK (
  email IS NOT NULL AND name IS NOT NULL AND password_hash IS NOT NULL
);

-- Step 5: Update comments to document the standalone-only approach
COMMENT ON TABLE admin_users IS 'Admin user accounts - all admins are standalone with their own credentials, completely separate from customer accounts';
COMMENT ON COLUMN admin_users.user_id IS 'DEPRECATED: Always NULL. Admin accounts are no longer linked to customer accounts.';
COMMENT ON COLUMN admin_users.email IS 'Email for admin login (required for all admins)';
COMMENT ON COLUMN admin_users.name IS 'Display name for admin user (required for all admins)';
COMMENT ON COLUMN admin_users.password_hash IS 'Bcrypt password hash (required for all admins)';
COMMENT ON CONSTRAINT admin_users_standalone_only ON admin_users IS 'Ensures complete separation: admin accounts cannot be linked to customer accounts';
COMMENT ON CONSTRAINT admin_users_required_fields ON admin_users IS 'All standalone admins must have email, name, and password';

-- Step 6: Add index on email for faster login lookups (already exists from migration 010, but ensure it's there)
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_unique 
ON admin_users(email);

-- Note: This migration deletes all linked admins (user_id IS NOT NULL).
-- Linked admins must be recreated as standalone admins using:
--   pnpm tsx scripts/seed-admin.ts <email> [role-id] [--generate-password]
-- This is necessary because linked admins used customer passwords which cannot be migrated.

