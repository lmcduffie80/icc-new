-- Fix Glufosinate 280SL rates that were set incorrectly in migration 074.
-- Migration 074 used 6–12 fl oz/acre (0.047–0.094 gal/acre) but the correct
-- label rates for Glufosinate 280SL are 22–43 fl oz/acre (0.172–0.336 gal/acre).
--
-- This affects the AI crop plan generator which uses these rates as the
-- "Label Rate Range" context when selecting application rates for farmer plans.

-- 1. Fix products.attributes fallback text (shown to AI when no approved rate exists)
UPDATE products
SET attributes = jsonb_set(
  attributes,
  '{applicationRateRange}',
  '"0.172–0.336 gal/acre (22–43 fl oz/acre)"'
)
WHERE id = 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b';

-- 2. Fix all acre_pack_pass_products rows for Glufosinate 280SL
-- (corn Post-Emerge pass 2, corn Burndown pass 16, soybeans Post-Emerge pass 6,
--  soybeans Burndown pass 18, cotton Post-Emerge pass 14, cotton Burndown pass 12)
UPDATE acre_pack_pass_products
SET
  min_rate = 0.172,
  default_rate_per_acre = 0.180,
  max_rate = 0.336
WHERE product_id = 'e6bdcf25-be8d-4830-96d1-5ed5d3a5172b'
  AND rate_unit = 'gal';
