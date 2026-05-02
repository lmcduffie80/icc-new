-- Migration 090: Admin impersonation sessions
-- Tracks when an admin is viewing the platform as a specific customer.
-- Tokens expire after 1 hour and must be explicitly ended.

CREATE TABLE IF NOT EXISTS admin_impersonation_sessions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_user_id   TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  target_user_id  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- The tenant the admin is impersonating into (which portal they'll land on)
  target_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  -- Secure random token stored in a cookie; validated on every request
  token           TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  -- Set when the admin explicitly ends the session or it naturally expires
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_impersonation_token ON admin_impersonation_sessions(token)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON admin_impersonation_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_target ON admin_impersonation_sessions(target_user_id);

COMMENT ON TABLE admin_impersonation_sessions IS
  'Tracks admin-initiated impersonation of customer accounts. Tokens expire after 1 hour.';
