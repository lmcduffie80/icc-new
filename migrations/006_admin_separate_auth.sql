-- Add separate password for admin users
-- This decouples admin authentication from customer authentication

ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Create index for faster lookups during admin login
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);

-- Create admin sessions table for separate session management
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

COMMENT ON COLUMN admin_users.password_hash IS 'Separate password hash for admin portal access';
COMMENT ON COLUMN admin_users.password_set_at IS 'When the admin password was last set';
COMMENT ON COLUMN admin_users.failed_login_attempts IS 'Counter for failed login attempts (for lockout)';
COMMENT ON COLUMN admin_users.locked_until IS 'Account locked until this timestamp after too many failed attempts';
COMMENT ON TABLE admin_sessions IS 'Separate session management for admin users';

