-- Migration: Add product cost column for financial reporting
-- Description: Add cost column to products table to support COGS calculations and inventory valuation

-- Add cost column (nullable to allow gradual data entry)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2);

-- Add comment to document the column's purpose
COMMENT ON COLUMN products.cost IS 'Cost of goods - used for COGS calculation and inventory valuation';

-- Create index for financial queries
CREATE INDEX IF NOT EXISTS idx_products_cost ON products(cost) WHERE cost IS NOT NULL;

-- Optional: Set initial cost as percentage of price for existing products (adjust percentage as needed)
-- This gives a reasonable starting value, but admins should update with actual costs
-- Commented out by default - uncomment if you want to seed initial cost data
-- UPDATE products 
-- SET cost = price * 0.60  -- Assuming 40% margin
-- WHERE cost IS NULL AND price IS NOT NULL;
