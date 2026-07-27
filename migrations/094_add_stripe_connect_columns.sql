-- Migration 094: Add Stripe Connect payment columns to tenants.
-- Separate from stripe_customer_id/stripe_subscription_id (migration 083), which are
-- for the Agrovus SaaS subscription billing (lib/billing.ts) — this is for the
-- tenant's OWN commerce payments (customers buying products from their storefront).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS payments_mode TEXT NOT NULL DEFAULT 'own_stripe',
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS commission_bps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_tenants_payments_mode' AND table_name = 'tenants'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT chk_tenants_payments_mode CHECK (payments_mode IN ('own_stripe', 'icc_managed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_connect_account_id
  ON tenants(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;
