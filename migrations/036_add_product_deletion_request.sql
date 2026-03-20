-- Add deletion_requested_at column to products table
-- This tracks when a supplier requests to delete a product (requires admin approval)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for querying products with pending deletion requests
CREATE INDEX IF NOT EXISTS idx_products_deletion_requested 
  ON products(deletion_requested_at) 
  WHERE deletion_requested_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.deletion_requested_at IS 'Timestamp when supplier requested deletion of this product. NULL means no deletion request. Product deletion requires admin approval.';

