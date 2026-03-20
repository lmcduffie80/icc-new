-- Migration: 049_add_msrp_field.sql
-- Description: Adds MSRP field to separate customer-facing compare-at pricing from internal supplier cost

-- Add MSRP field for customer-facing compare-at pricing
ALTER TABLE products ADD COLUMN IF NOT EXISTS msrp DECIMAL(10,2);

-- Add comment for documentation
COMMENT ON COLUMN products.msrp IS 'Manufacturer Suggested Retail Price - optional compare-at price shown to customers (crossed out). Separate from original_price which is internal supplier cost.';

-- Add index for performance (partial index for non-null values)
CREATE INDEX IF NOT EXISTS idx_products_msrp ON products(msrp) WHERE msrp IS NOT NULL;
