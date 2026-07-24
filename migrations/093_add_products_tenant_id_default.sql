-- Migration 093: Safety-net default for products.tenant_id.
-- Tasks in this plan make every INSERT pass an explicit tenant_id, but this
-- default protects any INSERT path we missed from throwing a NOT NULL
-- violation — it silently falls back to the ICC tenant instead of failing.
ALTER TABLE products ALTER COLUMN tenant_id SET DEFAULT 'tenant_icc_default';
