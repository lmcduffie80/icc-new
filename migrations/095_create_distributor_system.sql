-- Migration 095: Create distributor system
-- Adds distributor status to user profiles and a per-product distributor pricing table.
-- Distributors get access to a private portal with discounted pricing.

-- 1. Add distributor flag to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_distributor BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_notes TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_approved_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_approved_by TEXT; -- admin user id

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_distributor ON user_profiles(is_distributor) WHERE is_distributor = true;

-- 2. Distributor pricing table
-- Admin sets either a flat price_override OR a discount_percent per product, scoped to a tenant.
-- If both are set, price_override takes precedence.
CREATE TABLE IF NOT EXISTS distributor_pricing (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_override DECIMAL(10, 2),          -- flat dollar price for distributors
  discount_percent DECIMAL(5, 2),         -- % off retail (0–100), used if no price_override
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, product_id),
  CONSTRAINT distributor_pricing_has_value CHECK (
    price_override IS NOT NULL OR discount_percent IS NOT NULL
  ),
  CONSTRAINT distributor_pricing_price_positive CHECK (
    price_override IS NULL OR price_override >= 0
  ),
  CONSTRAINT distributor_pricing_discount_range CHECK (
    discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_distributor_pricing_tenant ON distributor_pricing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_distributor_pricing_product ON distributor_pricing(product_id);

COMMENT ON TABLE distributor_pricing IS 'Per-product distributor pricing overrides. price_override takes precedence over discount_percent.';
COMMENT ON COLUMN distributor_pricing.price_override IS 'Flat dollar price shown to distributors. Overrides discount_percent if both set.';
COMMENT ON COLUMN distributor_pricing.discount_percent IS 'Percentage discount off retail price (0–100). Used when no price_override is set.';
