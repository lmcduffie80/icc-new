-- Migration 087: Add country/tax_type columns to tax_rates and seed Canadian rates.
-- Existing US rows default to country='US'. Canadian rates use province codes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tax_rates' AND column_name='country'
  ) THEN
    ALTER TABLE tax_rates ADD COLUMN country TEXT NOT NULL DEFAULT 'US';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tax_rates' AND column_name='tax_type'
  ) THEN
    ALTER TABLE tax_rates ADD COLUMN tax_type TEXT;
  END IF;
END $$;

-- Index for country lookups
CREATE INDEX IF NOT EXISTS idx_tax_rates_country ON tax_rates(country);

-- Seed Canadian provincial/territorial tax rates.
-- All rates effective 2024-01-01; insert per tenant_id = icc default for seeding.
-- These are rates as of 2024. GST = 5% federal, HST = combined federal+provincial.
DO $$
DECLARE
  icc_tenant_id TEXT := 'tenant_icc_default';
  effective     DATE := '2024-01-01';
BEGIN
  -- Only insert if no Canadian rates exist yet
  IF NOT EXISTS (SELECT 1 FROM tax_rates WHERE country = 'CA') THEN
    -- HST provinces (combined federal + provincial in one rate)
    INSERT INTO tax_rates (state_code, rate, effective_date, is_active, country, tax_type, tenant_id) VALUES
      ('NB', 0.15,    effective, true, 'CA', 'HST', icc_tenant_id), -- New Brunswick 15%
      ('NL', 0.15,    effective, true, 'CA', 'HST', icc_tenant_id), -- Newfoundland & Labrador 15%
      ('NS', 0.15,    effective, true, 'CA', 'HST', icc_tenant_id), -- Nova Scotia 15%
      ('ON', 0.13,    effective, true, 'CA', 'HST', icc_tenant_id), -- Ontario 13%
      ('PE', 0.15,    effective, true, 'CA', 'HST', icc_tenant_id), -- Prince Edward Island 15%
    -- GST-only provinces/territories (5% federal, no provincial added here)
      ('AB', 0.05,    effective, true, 'CA', 'GST', icc_tenant_id), -- Alberta 5%
      ('NT', 0.05,    effective, true, 'CA', 'GST', icc_tenant_id), -- Northwest Territories 5%
      ('NU', 0.05,    effective, true, 'CA', 'GST', icc_tenant_id), -- Nunavut 5%
      ('YT', 0.05,    effective, true, 'CA', 'GST', icc_tenant_id), -- Yukon 5%
    -- GST + PST provinces (combined rate stored for simplicity)
      ('BC', 0.12,    effective, true, 'CA', 'GST+PST', icc_tenant_id), -- BC: 5% GST + 7% PST
      ('MB', 0.12,    effective, true, 'CA', 'GST+PST', icc_tenant_id), -- Manitoba: 5% GST + 7% PST
      ('SK', 0.11,    effective, true, 'CA', 'GST+PST', icc_tenant_id), -- Saskatchewan: 5% GST + 6% PST
    -- GST + QST (Quebec)
      ('QC', 0.14975, effective, true, 'CA', 'GST+QST', icc_tenant_id); -- Quebec: 5% GST + 9.975% QST
  END IF;
END $$;
