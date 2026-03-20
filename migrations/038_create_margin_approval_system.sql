-- Migration: Create Margin Approval System
-- Description: Add margin split functionality for supplier products with separate approval workflow

-- Add margin-related columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_split_percentage DECIMAL(5,2) CHECK (margin_split_percentage >= 0 AND margin_split_percentage <= 100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approval_status TEXT DEFAULT 'pending' CHECK (margin_approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approval_notes TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approved_by TEXT REFERENCES admin_users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_approved_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_submitted_at TIMESTAMPTZ;

-- Create margin approval history table for audit trail
CREATE TABLE IF NOT EXISTS margin_approval_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'updated')),
    performed_by TEXT,
    performer_type TEXT NOT NULL CHECK (performer_type IN ('admin', 'supplier')),
    margin_split_percentage DECIMAL(5,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_products_margin_approval_status ON products(margin_approval_status);
CREATE INDEX IF NOT EXISTS idx_products_margin_submitted_at ON products(margin_submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_approval_history_product_id ON margin_approval_history(product_id);
CREATE INDEX IF NOT EXISTS idx_margin_approval_history_created_at ON margin_approval_history(created_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN products.margin_split_percentage IS 'Percentage of margin (price - supplier_price) that supplier shares with platform (0-100)';
COMMENT ON COLUMN products.margin_approval_status IS 'Status of margin approval: pending, approved, or rejected';
COMMENT ON COLUMN products.margin_approval_notes IS 'Admin notes, especially for rejection reasons';
COMMENT ON COLUMN products.margin_approved_by IS 'ID of admin user who approved/rejected the margin';
COMMENT ON COLUMN products.margin_approved_at IS 'Timestamp when margin was approved/rejected';
COMMENT ON COLUMN products.margin_submitted_at IS 'Timestamp when margin was submitted for approval';
COMMENT ON TABLE margin_approval_history IS 'Audit trail for all margin approval actions';
