-- Packaging-aware competitor pricing + open-web discovery.
--
-- Up to now the agent only matched competitor listings on active ingredient +
-- concentration. A 2.5 gal jug of glyphosate would compare against a 30 gal
-- drum, which is misleading. This migration adds canonical packaging columns
-- so the read API can filter by package size, and seeds an "Open Web"
-- competitor that the fetch agent treats as "no domain restriction" so we
-- discover listings on any retailer (Amazon, Tractor Supply, manufacturer
-- sites, etc.) with the source URL captured for audit.
--
-- Backfill is intentionally NOT run here: existing rows keep
-- package_canonical = NULL and the read API treats NULL as "matches anything"
-- so no historic listings disappear. The next nightly cron repopulates the
-- new columns automatically.

-- 1. Allow open-web competitor to skip a base_url (Anthropic web search just
--    omits allowedDomains in that case).
ALTER TABLE competitors
  ALTER COLUMN base_url DROP NOT NULL;

-- 2. Add canonical packaging + retailer columns to competitor_products.
ALTER TABLE competitor_products
  ADD COLUMN IF NOT EXISTS package_canonical TEXT,
  ADD COLUMN IF NOT EXISTS package_size_value DECIMAL(10,3),
  ADD COLUMN IF NOT EXISTS package_size_unit TEXT,
  ADD COLUMN IF NOT EXISTS retailer_name TEXT;

COMMENT ON COLUMN competitor_products.package_canonical
  IS 'Normalized package key, e.g. "2.5gal", "30gal", "1qt", "50lb". NULL = packaging unknown (legacy rows or unparseable competitor data). Read API treats NULL as a match so legacy rows still surface.';
COMMENT ON COLUMN competitor_products.package_size_value
  IS 'Numeric package size (e.g. 2.5 for "2.5 gal"). NULL when unknown.';
COMMENT ON COLUMN competitor_products.package_size_unit
  IS 'Normalized unit token: gal | qt | pt | fl_oz | lb | oz | l | ml | kg | g | each | case.';
COMMENT ON COLUMN competitor_products.retailer_name
  IS 'For open-web hits, the actual retailer Claude found (e.g. "Tractor Supply"). NULL for domain-locked competitors where competitors.name already identifies the retailer.';

-- 3. Replace the partial unique index so packaging variants and multiple
--    open-web retailers can coexist for the same (competitor, ingredient).
--
--    Old index: UNIQUE (competitor_id, normalized_active_ingredient,
--                       COALESCE(concentration_percent, -1))
--    New index: also includes package_canonical and source_url.
DROP INDEX IF EXISTS ux_competitor_products_live;

CREATE UNIQUE INDEX IF NOT EXISTS ux_competitor_products_live
  ON competitor_products(
    competitor_id,
    normalized_active_ingredient,
    COALESCE(concentration_percent, -1),
    COALESCE(package_canonical, ''),
    COALESCE(source_url, '')
  )
  WHERE fetch_status = 'ok';

CREATE INDEX IF NOT EXISTS idx_competitor_products_package_canonical
  ON competitor_products(package_canonical);

-- 4. Seed the Open Web pseudo-competitor. base_url is NULL so the fetch
--    agent omits allowedDomains and Claude is free to search across any
--    retailer. The search_template includes a {{packaging}} hint so the
--    agent biases toward listings that match the requested container size.
--
--    Migration 084 added a NOT NULL tenant_id to `competitors`; new seeds
--    must explicitly assign the default ICC tenant.
INSERT INTO competitors (name, slug, base_url, search_template, is_active, tenant_id)
VALUES (
  'Open Web',
  'open-web',
  NULL,
  '{{ingredient}} {{concentration}} {{packaging}} buy online',
  true,
  'tenant_icc_default'
)
ON CONFLICT (slug) DO NOTHING;
