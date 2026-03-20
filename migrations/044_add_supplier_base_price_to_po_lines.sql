-- Migration 044: Add supplier_base_price to purchase_order_lines
-- Description: Adds supplier_base_price column to support new margin calculation formula
-- where ICC gets a percentage of total margin and supplier gets the rest

ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS supplier_base_price DECIMAL(10,2);

-- Add comment to explain the column
COMMENT ON COLUMN purchase_order_lines.supplier_base_price IS 'Supplier''s base cost before margin split. Used to calculate PO unit price: supplier_base_price + supplier_share_of_margin';
