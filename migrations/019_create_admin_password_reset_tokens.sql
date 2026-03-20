-- Migration 019: Admin Password Reset Tokens
-- Creates table for secure, single-use password reset tokens with 24-hour expiry
-- Supports emergency self-service recovery for locked-out admins

-- Admin password reset tokens table
CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for token lookups
CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_token
  ON admin_password_reset_tokens(token);

CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_admin_user_id
  ON admin_password_reset_tokens(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_expires_at
  ON admin_password_reset_tokens(expires_at);

-- Partial index for unused tokens
-- Improves performance for checking valid tokens
CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_unused
  ON admin_password_reset_tokens(admin_user_id, expires_at)
  WHERE used_at IS NULL;

-- Table and column comments for documentation
COMMENT ON TABLE admin_password_reset_tokens IS
  'Secure password reset tokens for admin users (single-use, 24hr expiry)';

COMMENT ON COLUMN admin_password_reset_tokens.id IS
  'Unique identifier for the reset token record';

COMMENT ON COLUMN admin_password_reset_tokens.admin_user_id IS
  'Foreign key reference to admin_users table';

COMMENT ON COLUMN admin_password_reset_tokens.token IS
  'Cryptographically secure random token (64 hex chars from 32 random bytes)';

COMMENT ON COLUMN admin_password_reset_tokens.expires_at IS
  'Token expiration timestamp (24 hours from creation)';

COMMENT ON COLUMN admin_password_reset_tokens.used_at IS
  'Timestamp when token was used (NULL if unused) - enforces single-use';

COMMENT ON COLUMN admin_password_reset_tokens.ip_address IS
  'IP address that requested the reset (for audit trail)';

COMMENT ON COLUMN admin_password_reset_tokens.user_agent IS
  'User agent string from reset request (for audit trail)';

COMMENT ON COLUMN admin_password_reset_tokens.created_at IS
  'Timestamp when token was created';
