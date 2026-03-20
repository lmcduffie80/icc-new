-- Add invoice_exempt flag to user_profiles.
-- When true, the user bypasses the invoice upload and state-matching checks at checkout.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS invoice_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.invoice_exempt IS 'When true, user is exempt from the invoice requirement at checkout';
