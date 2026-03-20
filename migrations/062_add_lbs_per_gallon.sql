-- Add weight-to-volume conversion factor for AcrePack pass products.
-- When set, the admin enters the rate in lbs/acre and unit_size in gallons;
-- the system divides ratePerAcre by lbs_per_gallon to get gal/acre for cost calculation.
ALTER TABLE acre_pack_pass_products
ADD COLUMN IF NOT EXISTS lbs_per_gallon NUMERIC(10,4) DEFAULT NULL;
