-- Migration 083: Create tenants and tenant_memberships tables
-- Foundation for the Agrovus multi-tenant SaaS platform.

CREATE TABLE IF NOT EXISTS tenants (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug                   TEXT UNIQUE NOT NULL,
  name                   TEXT NOT NULL,
  logo_url               TEXT,
  primary_color          TEXT DEFAULT '#16a34a',
  country                TEXT NOT NULL DEFAULT 'US', -- 'US' | 'CA'
  currency               TEXT NOT NULL DEFAULT 'USD', -- 'USD' | 'CAD'
  -- plan_id FK added in migration 086 after plans table exists
  plan_id                TEXT,
  billing_type           TEXT NOT NULL DEFAULT 'manual', -- 'stripe' | 'manual'
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  subscription_status    TEXT NOT NULL DEFAULT 'active',
  -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  trial_ends_at          TIMESTAMPTZ,
  billing_cycle          TEXT DEFAULT 'monthly', -- 'monthly' | 'annual'
  is_active              BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tenants_updated_at ON tenants;
CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_tenants_updated_at();

-- Tenant memberships: links users to tenants with a role
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'customer', -- 'customer' | 'tenant_admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON tenant_memberships(tenant_id);

-- Seed the default ICC tenant (the existing single-tenant instance)
INSERT INTO tenants (id, slug, name, subscription_status, billing_type, is_active)
VALUES (
  'tenant_icc_default',
  'icc',
  'Innovative Crop Care',
  'active',
  'manual',
  true
)
ON CONFLICT (slug) DO NOTHING;
