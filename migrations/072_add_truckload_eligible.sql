-- Add truckload_eligible flag to products
-- Allows explicit marking of products (e.g. Glyphosate totes) as eligible for truckload shipping
-- regardless of unit_of_measure or name string patterns

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS truckload_eligible BOOLEAN NOT NULL DEFAULT FALSE;
