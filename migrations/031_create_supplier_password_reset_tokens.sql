-- Migration 031: Supplier Password Reset Tokens
-- Creates table for secure, single-use password reset tokens with 24-hour expiry
-- Supports self-service password recovery for supplier users

-- Supplier password reset tokens table
CREATE TABLE IF NOT EXISTS supplier_password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_user_id TEXT NOT NULL REFERENCES supplier_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for token lookups
CREATE INDEX IF NOT EXISTS idx_supplier_password_reset_tokens_token
  ON supplier_password_reset_tokens(token);

CREATE INDEX IF NOT EXISTS idx_supplier_password_reset_tokens_supplier_user_id
  ON supplier_password_reset_tokens(supplier_user_id);

CREATE INDEX IF NOT EXISTS idx_supplier_password_reset_tokens_expires_at
  ON supplier_password_reset_tokens(expires_at);

-- Partial index for unused tokens
-- Improves performance for checking valid tokens
CREATE INDEX IF NOT EXISTS idx_supplier_password_reset_tokens_unused
  ON supplier_password_reset_tokens(supplier_user_id, expires_at)
  WHERE used_at IS NULL;

-- Table and column comments for documentation
COMMENT ON TABLE supplier_password_reset_tokens IS
  'Secure password reset tokens for supplier users (single-use, 24hr expiry)';

COMMENT ON COLUMN supplier_password_reset_tokens.id IS
  'Unique identifier for the reset token record';

COMMENT ON COLUMN supplier_password_reset_tokens.supplier_user_id IS
  'Foreign key reference to supplier_users table';

COMMENT ON COLUMN supplier_password_reset_tokens.token IS
  'Cryptographically secure random token (64 hex chars from 32 random bytes)';

COMMENT ON COLUMN supplier_password_reset_tokens.expires_at IS
  'Token expiration timestamp (24 hours from creation)';

COMMENT ON COLUMN supplier_password_reset_tokens.used_at IS
  'Timestamp when token was used (NULL if unused) - enforces single-use';

COMMENT ON COLUMN supplier_password_reset_tokens.ip_address IS
  'IP address that requested the reset (for audit trail)';

COMMENT ON COLUMN supplier_password_reset_tokens.user_agent IS
  'User agent string from reset request (for audit trail)';

COMMENT ON COLUMN supplier_password_reset_tokens.created_at IS
  'Timestamp when token was created';

