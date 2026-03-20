-- Add minimum_order_qty column to products table
-- This replaces the review_count field usage for minimum order quantity validation

ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order_qty INTEGER DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN products.minimum_order_qty IS 'Minimum order quantity required for this product. If set, customers must order at least this quantity.';

