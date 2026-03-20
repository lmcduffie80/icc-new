-- Add next available inventory fields to products table
-- These fields allow admins to specify when additional inventory will be available

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS next_available_quantity INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_available_date DATE DEFAULT NULL;

-- Add index for querying products by next available date
CREATE INDEX IF NOT EXISTS idx_products_next_available_date ON products(next_available_date) WHERE next_available_date IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.next_available_quantity IS 'Expected quantity that will be available on next_available_date';
COMMENT ON COLUMN products.next_available_date IS 'Expected date when next_available_quantity will be in stock';

