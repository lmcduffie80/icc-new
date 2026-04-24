-- Create competitor pricing system for comparing ICC products to competing
-- distributors (FBN, Forestry Distributing, Chemical Warehouse) by active
-- ingredient. An AI-powered nightly cron populates competitor_products, and
-- the /compare page + product detail page read from it at view time.

-- 1. Enable pg_trgm for fuzzy product_name fallback matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Competitors directory table
CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  search_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitors_is_active ON competitors(is_active);

COMMENT ON TABLE competitors IS 'Directory of external distributors we compare prices against.';
COMMENT ON COLUMN competitors.search_template IS 'Optional hint passed to the AI fetch agent, e.g. "site:fbn.com {{ingredient}} {{concentration}}".';

-- 3. Competitor products table (one row per (competitor, ingredient match))
CREATE TABLE IF NOT EXISTS competitor_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  normalized_active_ingredient TEXT NOT NULL,
  concentration_percent DECIMAL(6,3),
  price DECIMAL(10,2),
  unit_of_measure TEXT,
  container_size TEXT,
  source_url TEXT,
  last_fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  fetch_status TEXT NOT NULL DEFAULT 'ok' CHECK (fetch_status IN ('ok', 'failed', 'not_found')),
  raw_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_products_ingredient
  ON competitor_products(normalized_active_ingredient);
CREATE INDEX IF NOT EXISTS idx_competitor_products_competitor
  ON competitor_products(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_products_last_fetched_at
  ON competitor_products(last_fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_products_fetch_status
  ON competitor_products(fetch_status);
CREATE INDEX IF NOT EXISTS idx_competitor_products_product_name_trgm
  ON competitor_products USING gin (product_name gin_trgm_ops);

-- Only one "ok" row per (competitor, ingredient, concentration) so upserts
-- overwrite the prior price rather than accumulating stale duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS ux_competitor_products_live
  ON competitor_products(competitor_id, normalized_active_ingredient, COALESCE(concentration_percent, -1))
  WHERE fetch_status = 'ok';

COMMENT ON TABLE competitor_products IS 'Competitor distributor listings matched to ICC products by active ingredient. Refreshed nightly by /api/cron/refresh-competitor-pricing.';
COMMENT ON COLUMN competitor_products.normalized_active_ingredient IS 'Lowercased single-word or canonical ingredient name (e.g. "glyphosate"). Computed by lib/competitor-match.ts.';
COMMENT ON COLUMN competitor_products.concentration_percent IS 'Active ingredient concentration (e.g. 41.000 for 41% glyphosate). NULL if not applicable.';
COMMENT ON COLUMN competitor_products.fetch_status IS 'ok = price captured, not_found = agent searched but found no listing, failed = agent errored.';

-- 4. Seed the three competitors the business tracks today
INSERT INTO competitors (name, slug, base_url, search_template, is_active)
VALUES
  ('FBN', 'fbn', 'https://www.fbn.com', 'site:fbn.com {{ingredient}} {{concentration}}', true),
  ('Forestry Distributing', 'forestry-distributing', 'https://www.forestrydistributing.com', 'site:forestrydistributing.com {{ingredient}} {{concentration}}', true),
  ('Chemical Warehouse', 'chemical-warehouse', 'https://www.chemicalwarehouse.com', 'site:chemicalwarehouse.com {{ingredient}} {{concentration}}', true)
ON CONFLICT (slug) DO NOTHING;
