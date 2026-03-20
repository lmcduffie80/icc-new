-- Fix Glyphosate 53.8% products.attributes.applicationRateRange text.
-- Migration 074 set this to "0.5–1.5 gal/acre (22–128 fl oz/acre)" which is
-- internally inconsistent — the gal and fl oz numbers don't correspond:
--   0.5 gal = 64 fl oz (not 22), 1.5 gal = 192 fl oz (not 128)
--
-- The correct text matching the actual acre_pack_pass_products values
-- (min=0.172, max=1.0 gal/acre) is "0.172–1.0 gal/acre (22–128 fl oz/acre)".
--
-- Note: acre_pack_pass_products rates are already correct and unchanged.
-- This only fixes the fallback attribute text shown to the AI when a product
-- has no approved rate entry in acre_pack_pass_products.

UPDATE products
SET attributes = jsonb_set(
  attributes,
  '{applicationRateRange}',
  '"0.172–1.0 gal/acre (22–128 fl oz/acre)"'
)
WHERE id = '2d65cea9-82be-4994-8984-fca4d504c2eb';
