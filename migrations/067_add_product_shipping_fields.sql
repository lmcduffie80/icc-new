-- Add NMFC number and carton dimension fields to products table
-- Used for accurate BOL line-item NMFC codes and EasyPost parcel dimensions

ALTER TABLE products ADD COLUMN IF NOT EXISTS nmfc_number TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS carton_length DECIMAL(8,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS carton_width  DECIMAL(8,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS carton_height DECIMAL(8,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS carton_weight_lbs DECIMAL(8,2);

COMMENT ON COLUMN products.nmfc_number IS 'National Motor Freight Classification number for this product (e.g. 46120)';
COMMENT ON COLUMN products.carton_length IS 'Carton/unit length in inches (for freight quoting)';
COMMENT ON COLUMN products.carton_width IS 'Carton/unit width in inches (for freight quoting)';
COMMENT ON COLUMN products.carton_height IS 'Carton/unit height in inches (for freight quoting)';
COMMENT ON COLUMN products.carton_weight_lbs IS 'Gross carton/unit weight in pounds as shipped (for freight quoting)';
