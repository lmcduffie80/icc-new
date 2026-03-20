-- AcrePack: crop input planning tool
-- Creates programs (per crop), passes (application timings), and pass_products (product assignments)

CREATE TABLE IF NOT EXISTS acre_pack_programs (
  id          SERIAL PRIMARY KEY,
  crop        VARCHAR(50) NOT NULL UNIQUE, -- corn, soybeans, wheat, cotton
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  image_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acre_pack_passes (
  id            SERIAL PRIMARY KEY,
  program_id    INTEGER NOT NULL REFERENCES acre_pack_programs(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,        -- e.g. "Pre-Emerge Herbicide"
  timing_label  VARCHAR(100),                 -- e.g. "Spring, before planting"
  category      VARCHAR(50) NOT NULL,         -- Herbicides, Fungicides, Insecticides, Adjuvants
  description   TEXT,
  is_required   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acre_pack_pass_products (
  id                    SERIAL PRIMARY KEY,
  pass_id               INTEGER NOT NULL REFERENCES acre_pack_passes(id) ON DELETE CASCADE,
  product_id            TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_recommended        BOOLEAN NOT NULL DEFAULT false,
  default_rate_per_acre NUMERIC(10,4) NOT NULL DEFAULT 1,
  min_rate              NUMERIC(10,4) NOT NULL DEFAULT 0.5,
  max_rate              NUMERIC(10,4) NOT NULL DEFAULT 4,
  rate_unit             VARCHAR(30) NOT NULL DEFAULT 'fl oz', -- fl oz, oz, lbs, pt, qt, gal
  unit_size             NUMERIC(10,4) NOT NULL DEFAULT 1,     -- size of one purchasable unit in rate_unit
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pass_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_acre_pack_passes_program_id ON acre_pack_passes(program_id);
CREATE INDEX IF NOT EXISTS idx_acre_pack_pass_products_pass_id ON acre_pack_pass_products(pass_id);
CREATE INDEX IF NOT EXISTS idx_acre_pack_pass_products_product_id ON acre_pack_pass_products(product_id);

-- Seed the four crop programs
INSERT INTO acre_pack_programs (crop, name, description, sort_order) VALUES
  ('corn',     'Corn Program',     'Complete input plan for corn production — herbicides, fungicides, and adjuvants optimized for maximum yield.', 1),
  ('soybeans', 'Soybean Program',  'Full-season soybean input plan covering pre-emerge weed control, disease management, and biological options.', 2),
  ('wheat',    'Wheat Program',    'Winter and spring wheat program with targeted herbicide and fungicide passes for head scab and rust control.', 3),
  ('cotton',   'Cotton Program',   'Cotton-specific input plan covering burndown, pre-emerge, and in-season passes for weed and disease pressure.', 4)
ON CONFLICT (crop) DO NOTHING;

-- Seed passes for Corn
INSERT INTO acre_pack_passes (program_id, name, timing_label, category, description, is_required, sort_order)
SELECT p.id, pass.name, pass.timing_label, pass.category, pass.description, pass.is_required, pass.sort_order
FROM acre_pack_programs p,
(VALUES
  ('Pre-Emerge Herbicide',    'Spring, before crop emergence',    'Herbicides',  'Apply before weeds and crop emerge for season-long weed control.',    true,  1),
  ('Post-Emerge Herbicide',   'Spring, after crop emergence',     'Herbicides',  'Broadleaf and grass control after the crop has emerged.',             true,  2),
  ('In-Season Fungicide',     'Summer, at VT/R1 growth stage',    'Fungicides',  'Protect yield by applying fungicide at tassel/silking stage.',        false, 3),
  ('Adjuvant / Surfactant',   'With each herbicide application',  'Adjuvants',   'Improve herbicide coverage and efficacy with the right adjuvant.',    false, 4)
) AS pass(name, timing_label, category, description, is_required, sort_order)
WHERE p.crop = 'corn';

-- Seed passes for Soybeans
INSERT INTO acre_pack_passes (program_id, name, timing_label, category, description, is_required, sort_order)
SELECT p.id, pass.name, pass.timing_label, pass.category, pass.description, pass.is_required, pass.sort_order
FROM acre_pack_programs p,
(VALUES
  ('Pre-Emerge Herbicide',    'Spring, before planting',          'Herbicides',  'Residual herbicide to control early-season weed pressure.',           true,  1),
  ('Post-Emerge Herbicide',   'Spring, V2–V4 growth stage',       'Herbicides',  'Post-emerge broadleaf and grass control.',                            true,  2),
  ('Fungicide / Disease',     'Summer, R3 pod fill stage',        'Fungicides',  'Protect yield potential with fungicide at pod fill.',                 false, 3),
  ('Biological Insect',       'As needed for pest pressure',      'Insecticides','Biological insect control option for soybean pests.',                 false, 4)
) AS pass(name, timing_label, category, description, is_required, sort_order)
WHERE p.crop = 'soybeans';

-- Seed passes for Wheat
INSERT INTO acre_pack_passes (program_id, name, timing_label, category, description, is_required, sort_order)
SELECT p.id, pass.name, pass.timing_label, pass.category, pass.description, pass.is_required, pass.sort_order
FROM acre_pack_programs p,
(VALUES
  ('Fall Pre-Emerge Herbicide', 'Fall, at planting',              'Herbicides',  'Control winter annual weeds at planting.',                           true,  1),
  ('Spring Post-Emerge',        'Spring, Feekes 4–6 stage',       'Herbicides',  'Broadleaf weed control in spring.',                                  true,  2),
  ('Head Scab Fungicide',       'Spring, at heading (Feekes 10)', 'Fungicides',  'Critical fungicide timing to protect against head scab (FHB).',      true,  3)
) AS pass(name, timing_label, category, description, is_required, sort_order)
WHERE p.crop = 'wheat';

-- Seed passes for Cotton
INSERT INTO acre_pack_passes (program_id, name, timing_label, category, description, is_required, sort_order)
SELECT p.id, pass.name, pass.timing_label, pass.category, pass.description, pass.is_required, pass.sort_order
FROM acre_pack_programs p,
(VALUES
  ('Burndown / Pre-Plant',    'Spring, before planting',          'Herbicides',  'Burndown existing vegetation and residual weed control.',             true,  1),
  ('Pre-Emerge Herbicide',    'At planting',                      'Herbicides',  'Residual herbicide applied at planting for early weed control.',      true,  2),
  ('Post-Emerge Herbicide',   'Early season, V2–V4',              'Herbicides',  'Post-emerge weed control.',                                          true,  3),
  ('Fungicide Treatment',     'Mid-season, boll development',     'Fungicides',  'Protect bolls from disease pressure.',                               false, 4)
) AS pass(name, timing_label, category, description, is_required, sort_order)
WHERE p.crop = 'cotton';

-- Grant AcrePack permissions to super-admin and admin roles
UPDATE admin_roles
SET permissions = permissions || '["acrepack.view","acrepack.manage_programs","acrepack.manage_products"]'::jsonb
WHERE id IN ('super-admin', 'admin')
  AND NOT (permissions @> '["acrepack.view"]'::jsonb);
