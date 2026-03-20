-- Innovative Crop Planning: farmer-saved crop plans with historical tracking
CREATE TABLE IF NOT EXISTS farmer_crop_plans (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  plan_year     INTEGER NOT NULL,
  crop          VARCHAR(50) NOT NULL,
  plan_name     VARCHAR(200) NOT NULL,
  total_acres   NUMERIC(12,2) NOT NULL DEFAULT 1000,
  target_weeds  TEXT[],
  weed_pressure VARCHAR(20),
  total_cost    NUMERIC(12,2),
  cost_per_acre NUMERIC(10,4),
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',
  ai_generated  BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Passes within a farmer plan (Pre-Emergent, Post-Emerge, In-Season, Adjuvants)
CREATE TABLE IF NOT EXISTS farmer_plan_passes (
  id            SERIAL PRIMARY KEY,
  plan_id       INTEGER NOT NULL REFERENCES farmer_crop_plans(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(50) NOT NULL,
  timing_label  VARCHAR(100),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  pass_cost     NUMERIC(12,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products within a plan pass (costs stored at time of plan creation)
CREATE TABLE IF NOT EXISTS farmer_plan_products (
  id                SERIAL PRIMARY KEY,
  plan_pass_id      INTEGER NOT NULL REFERENCES farmer_plan_passes(id) ON DELETE CASCADE,
  product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name      TEXT NOT NULL,
  rate_per_acre     NUMERIC(10,4) NOT NULL,
  rate_unit         VARCHAR(30) NOT NULL DEFAULT 'fl oz',
  units_needed      NUMERIC(12,4),
  unit_cost         NUMERIC(10,2),
  line_total        NUMERIC(12,2),
  cost_per_acre     NUMERIC(10,4),
  is_recommended    BOOLEAN NOT NULL DEFAULT false,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_farmer_plans_user ON farmer_crop_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_farmer_plans_year ON farmer_crop_plans(plan_year);
CREATE INDEX IF NOT EXISTS idx_farmer_plans_crop ON farmer_crop_plans(crop);
CREATE INDEX IF NOT EXISTS idx_farmer_plan_passes_plan ON farmer_plan_passes(plan_id);
CREATE INDEX IF NOT EXISTS idx_farmer_plan_products_pass ON farmer_plan_products(plan_pass_id);
