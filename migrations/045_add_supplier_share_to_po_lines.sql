-- Migration 045: Add supplier_share_amount to purchase_order_lines
-- Description: Adds supplier_share_amount column to track the supplier's portion of the margin
-- This is the amount the supplier earns from the margin split (not including their base cost)

ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS supplier_share_amount DECIMAL(10,2);

-- Add comment to explain the column
COMMENT ON COLUMN purchase_order_lines.supplier_share_amount IS 'Supplier''s share of the margin after ICC takes their percentage. Calculated as: (customer_pays - supplier_base_price) - icc_margin_amount';
