-- Add unit_of_measure column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_of_measure TEXT;

-- Add unit_of_measure column to order_items table to preserve historical data
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_of_measure TEXT;

-- Create index for filtering products by unit of measure (optional, for future use)
CREATE INDEX IF NOT EXISTS idx_products_unit_of_measure ON products(unit_of_measure) WHERE unit_of_measure IS NOT NULL;
