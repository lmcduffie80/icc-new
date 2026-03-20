-- Fix herbicide product attributes so the AI crop plan generator has proper rate data
-- Both Glyphosate 53.8% and Glufosinate 280SL had "See Label" as applicationRateRange
-- which prevents Claude from determining a numeric rate, causing products to be filtered out.
--
-- Also converts AcrePack Glyphosate rate_unit from fl oz to gal for consistency with
-- the FARMER_SYSTEM_PROMPT rule 5 which instructs Claude to prefer "gal" for liquid products.
--
-- Adds Glufosinate 280SL to AcrePack programs for corn, soybeans, and cotton.

-- 1. Fix Glyphosate 53.8% product attributes
UPDATE products
SET attributes = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(attributes, '{}'::jsonb),
        '{applicationRateRange}',
        '"0.5–1.5 gal/acre (22–128 fl oz/acre)"'
      ),
      '{containerSizes}',
      '"265 gal tote"'
    ),
    '{lbsPerGallon}',
    '"5.4"'
  ),
  '{activeIngredients}',
  '"Glyphosate, isopropylamine salt 53.8% (5.4 lbs ae/gal)"'
)
WHERE id = '2d65cea9-82be-4994-8984-fca4d504c2eb';

-- 2. Fix Glufosinate 280SL product attributes
UPDATE products
SET attributes = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(attributes, '{}'::jsonb),
        '{applicationRateRange}',
        '"0.047–0.094 gal/acre (6–12 fl oz/acre)"'
      ),
      '{containerSizes}',
      '"265 gal tote"'
    ),
    '{lbsPerGallon}',
    '"2.34"'
  ),
  '{activeIngredients}',
  '"Glufosinate-ammonium 27.8% (2.34 lbs ae/gal)"'
)
WHERE id = 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b';

-- 3. Convert all Glyphosate AcrePack rates from fl oz to gal
UPDATE acre_pack_pass_products
SET
  rate_unit = 'gal',
  min_rate = ROUND((min_rate / 128.0)::numeric, 4),
  max_rate = ROUND((max_rate / 128.0)::numeric, 4),
  default_rate_per_acre = ROUND((default_rate_per_acre / 128.0)::numeric, 4)
WHERE product_id = '2d65cea9-82be-4994-8984-fca4d504c2eb'
  AND rate_unit = 'fl oz';

-- 4. Add Glufosinate to corn Post-Emerge Herbicide (pass_id=2)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (2, 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b', 0.063, 0.047, 0.094, 'gal', 265, 'gal', 2.34, 1)
ON CONFLICT DO NOTHING;

-- 5. Add Glufosinate to corn Burndown/Pre-Plant Herbicide (pass_id=16)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (16, 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b', 0.063, 0.047, 0.094, 'gal', 265, 'gal', 2.34, 1)
ON CONFLICT DO NOTHING;

-- 6. Add Glufosinate to soybeans Post-Emerge Herbicide (pass_id=6)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (6, 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b', 0.063, 0.047, 0.094, 'gal', 265, 'gal', 2.34, 1)
ON CONFLICT DO NOTHING;

-- 7. Add Glufosinate to soybeans Burndown/Pre-Plant Herbicide (pass_id=18)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (18, 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b', 0.063, 0.047, 0.094, 'gal', 265, 'gal', 2.34, 1)
ON CONFLICT DO NOTHING;

-- 8. Add Glufosinate to cotton Post-Emerge Herbicide (pass_id=14)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (14, 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b', 0.063, 0.047, 0.094, 'gal', 265, 'gal', 2.34, 1)
ON CONFLICT DO NOTHING;

-- 9. Add Glufosinate to cotton Burndown/Pre-Plant (pass_id=12)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (12, 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b', 0.063, 0.047, 0.094, 'gal', 265, 'gal', 2.34, 1)
ON CONFLICT DO NOTHING;

-- 10. Add Glyphosate to cotton Burndown/Pre-Plant (pass_id=12)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (12, '2d65cea9-82be-4994-8984-fca4d504c2eb', 0.25, 0.172, 1.0, 'gal', 265, 'gal', 5.4, 0)
ON CONFLICT DO NOTHING;

-- 11. Add Glyphosate to cotton Post-Emerge Herbicide (pass_id=14)
INSERT INTO acre_pack_pass_products (
  pass_id, product_id,
  default_rate_per_acre, min_rate, max_rate, rate_unit,
  unit_size, unit_size_unit, lbs_per_gallon, sort_order
) VALUES (14, '2d65cea9-82be-4994-8984-fca4d504c2eb', 0.25, 0.172, 1.0, 'gal', 265, 'gal', 5.4, 0)
ON CONFLICT DO NOTHING;
