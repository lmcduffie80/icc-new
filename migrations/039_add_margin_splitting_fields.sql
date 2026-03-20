-- Migration 039: Add Margin Splitting Fields
-- Description: Adds margin splitting functionality for suppliers to specify ICC margin percentage

-- Add margin fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS icc_margin_percent DECIMAL(5,2); -- ICC's margin % (e.g., 8.00 for 8%)
ALTER TABLE products ADD COLUMN IF NOT EXISTS icc_margin_amount DECIMAL(10,2); -- Calculated: price × icc_margin_percent / 100
ALTER TABLE products ADD COLUMN IF NOT EXISTS customer_margin_percent DECIMAL(5,2); -- Calculated: ((price - supplier_price) - icc_margin_amount) / price × 100
ALTER TABLE products ADD COLUMN IF NOT EXISTS customer_margin_amount DECIMAL(10,2); -- Calculated: (price - supplier_price) - icc_margin_amount

-- Add margin approval status fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approval_status TEXT DEFAULT 'pending' 
  CHECK (margin_approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approved_by TEXT; -- admin user id
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_notes TEXT; -- Admin notes on margin approval

-- Create index for margin approval filtering
CREATE INDEX IF NOT EXISTS idx_products_margin_approval_status ON products(margin_approval_status);

-- Create product_margin_history table to track margin approval changes
CREATE TABLE IF NOT EXISTS product_margin_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'modified')),
  icc_margin_percent DECIMAL(5,2),
  performed_by TEXT, -- admin user id or supplier user id
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient product margin history queries
CREATE INDEX IF NOT EXISTS idx_product_margin_history_product_id ON product_margin_history(product_id);
CREATE INDEX IF NOT EXISTS idx_product_margin_history_created_at ON product_margin_history(created_at DESC);

-- Add margin columns to purchase_order_lines table
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS icc_margin_percent DECIMAL(5,2);
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS icc_margin_amount DECIMAL(10,2);
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS customer_margin_percent DECIMAL(5,2);
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS customer_margin_amount DECIMAL(10,2);
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS store_price DECIMAL(10,2);
