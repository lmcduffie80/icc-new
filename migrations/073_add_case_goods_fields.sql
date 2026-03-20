-- Add case goods fields for truckload detection
-- These fields allow pallet count and total weight calculation at checkout
-- to determine if an order of case goods qualifies for truckload shipping
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gallons_per_case NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS cases_per_pallet INTEGER,
  ADD COLUMN IF NOT EXISTS bulk_density_lbs_per_gallon NUMERIC(8,4);
