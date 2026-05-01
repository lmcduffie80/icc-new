-- Migration 088: MFA policy support
-- Adds per-tenant MFA enforcement + Better Auth twoFactor plugin schema.

-- 1. Per-tenant MFA requirement flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tenants' AND column_name='mfa_required'
  ) THEN
    ALTER TABLE tenants ADD COLUMN mfa_required BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Better Auth twoFactor plugin: user.twoFactorEnabled field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='user' AND column_name='two_factor_enabled'
  ) THEN
    ALTER TABLE "user" ADD COLUMN two_factor_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 3. Better Auth twoFactor table (stores TOTP secret + backup codes per user)
CREATE TABLE IF NOT EXISTS "twoFactor" (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  secret       TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL DEFAULT '[]',
  verified     BOOLEAN DEFAULT false,
  UNIQUE ("userId")
);

CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON "twoFactor"("userId");
