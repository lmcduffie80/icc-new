-- Migration 084: Add tenant_id to all tenant-scoped tables and backfill
-- All existing data is assigned to the default ICC tenant created in 083.

DO $$
DECLARE
  icc_tenant_id TEXT := 'tenant_icc_default';
BEGIN

-- products
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='products' AND column_name='tenant_id'
) THEN
  ALTER TABLE products ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE products SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- orders
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='orders' AND column_name='tenant_id'
) THEN
  ALTER TABLE orders ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE orders SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- user_profiles
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='user_profiles' AND column_name='tenant_id'
) THEN
  ALTER TABLE user_profiles ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE user_profiles SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE user_profiles ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- user_addresses
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='user_addresses' AND column_name='tenant_id'
) THEN
  ALTER TABLE user_addresses ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE user_addresses SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE user_addresses ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- farm_profiles
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='farm_profiles' AND column_name='tenant_id'
) THEN
  ALTER TABLE farm_profiles ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE farm_profiles SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE farm_profiles ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- user_invoices
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='user_invoices' AND column_name='tenant_id'
) THEN
  ALTER TABLE user_invoices ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE user_invoices SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE user_invoices ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- user_licenses
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='user_licenses' AND column_name='tenant_id'
) THEN
  ALTER TABLE user_licenses ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE user_licenses SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE user_licenses ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- site_content
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='site_content' AND column_name='tenant_id'
) THEN
  ALTER TABLE site_content ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE site_content SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE site_content ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- site_settings: key becomes (key, tenant_id) composite — add column first
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='site_settings' AND column_name='tenant_id'
) THEN
  ALTER TABLE site_settings ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE site_settings SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE site_settings ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- warehouses
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='warehouses' AND column_name='tenant_id'
) THEN
  ALTER TABLE warehouses ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE warehouses SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE warehouses ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- supplier_users
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='supplier_users' AND column_name='tenant_id'
) THEN
  ALTER TABLE supplier_users ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE supplier_users SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE supplier_users ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- supplier_contracts
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='supplier_contracts' AND column_name='tenant_id'
) THEN
  ALTER TABLE supplier_contracts ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE supplier_contracts SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE supplier_contracts ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- tax_rates
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='tax_rates' AND column_name='tenant_id'
) THEN
  ALTER TABLE tax_rates ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE tax_rates SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE tax_rates ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- contact_submissions
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='contact_submissions' AND column_name='tenant_id'
) THEN
  ALTER TABLE contact_submissions ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE contact_submissions SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE contact_submissions ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- acre_pack_programs
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='acre_pack_programs' AND column_name='tenant_id'
) THEN
  ALTER TABLE acre_pack_programs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE acre_pack_programs SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE acre_pack_programs ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- farmer_crop_plans
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='farmer_crop_plans' AND column_name='tenant_id'
) THEN
  ALTER TABLE farmer_crop_plans ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE farmer_crop_plans SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE farmer_crop_plans ALTER COLUMN tenant_id SET NOT NULL;
END IF;

-- competitors
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='competitors' AND column_name='tenant_id'
) THEN
  ALTER TABLE competitors ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  UPDATE competitors SET tenant_id = icc_tenant_id WHERE tenant_id IS NULL;
  ALTER TABLE competitors ALTER COLUMN tenant_id SET NOT NULL;
END IF;

END $$;

-- Performance indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_tenant_id ON user_addresses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_farm_profiles_tenant_id ON farm_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_invoices_tenant_id ON user_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_licenses_tenant_id ON user_licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_content_tenant_id ON site_content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_settings_tenant_id ON site_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_id ON warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_users_tenant_id ON supplier_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_tenant_id ON supplier_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tax_rates_tenant_id ON tax_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_tenant_id ON contact_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acre_pack_programs_tenant_id ON acre_pack_programs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_farmer_crop_plans_tenant_id ON farmer_crop_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_competitors_tenant_id ON competitors(tenant_id);
