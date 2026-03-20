-- Add container unit field to AcrePack pass products.
-- unit_size_unit stores the unit of measurement for the container (e.g., "gal", "fl oz", "qt", "pt", "lbs", "oz").
-- This allows the system to automatically convert between rate_unit and unit_size_unit when they differ
-- (e.g., rate in "fl oz/acre" with a container measured in "gal").
ALTER TABLE acre_pack_pass_products
ADD COLUMN IF NOT EXISTS unit_size_unit VARCHAR(20) DEFAULT NULL;
