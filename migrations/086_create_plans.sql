-- Migration 086: Create plans table and add FK from tenants.
-- Plans drive all feature flags — upgrading a plan instantly unlocks features.

CREATE TABLE IF NOT EXISTS plans (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                    TEXT UNIQUE NOT NULL, -- 'starter' | 'pro' | 'enterprise'
  display_name            TEXT NOT NULL,
  price_monthly_usd       DECIMAL(10,2),
  price_annual_usd        DECIMAL(10,2),
  stripe_monthly_price_id TEXT,
  stripe_annual_price_id  TEXT,
  features                JSONB NOT NULL DEFAULT '{}',
  sort_order              INTEGER DEFAULT 0,
  is_active               BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from tenants to plans (plan_id column already exists from migration 083)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tenants_plan' AND table_name = 'tenants'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT fk_tenants_plan
      FOREIGN KEY (plan_id) REFERENCES plans(id);
  END IF;
END $$;

-- Seed default plan tiers
INSERT INTO plans (name, display_name, price_monthly_usd, price_annual_usd, sort_order, features)
VALUES
  (
    'starter',
    'Starter',
    99.00,
    990.00,
    1,
    '{"supplier_portal":false,"acre_pack":false,"crop_planning":false,"white_label":false,"max_products":100}'
  ),
  (
    'pro',
    'Pro',
    249.00,
    2490.00,
    2,
    '{"supplier_portal":true,"acre_pack":true,"crop_planning":true,"white_label":false,"max_products":1000}'
  ),
  (
    'enterprise',
    'Enterprise',
    NULL,
    NULL,
    3,
    '{"supplier_portal":true,"acre_pack":true,"crop_planning":true,"white_label":true,"max_products":-1}'
  )
ON CONFLICT (name) DO NOTHING;

-- Assign default ICC tenant to the enterprise plan
UPDATE tenants
SET plan_id = (SELECT id FROM plans WHERE name = 'enterprise')
WHERE slug = 'icc' AND plan_id IS NULL;
