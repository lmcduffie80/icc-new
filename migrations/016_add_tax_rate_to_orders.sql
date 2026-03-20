-- Add tax_rate column to orders table
-- This stores the tax rate that was applied at the time of order creation for historical accuracy

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 4);

-- Add comment for documentation
COMMENT ON COLUMN orders.tax_rate IS 'Tax rate applied at time of order creation (e.g., 0.021 for 2.1%)';

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_orders_tax_rate ON orders(tax_rate) WHERE tax_rate IS NOT NULL;
