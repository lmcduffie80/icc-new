-- Migration 048: Restructure Supplier Product Workflow
-- Description: Add fields to support admin-initiated product creation with supplier assignment

-- Add new workflow tracking fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS assigned_to_supplier_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_review_status TEXT CHECK (supplier_review_status IN ('pending_supplier_review', 'supplier_in_progress', 'supplier_submitted', 'completed'));

-- Track completion status for supplier-managed sections
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_pricing_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_inventory_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_documents_completed BOOLEAN DEFAULT FALSE;

-- Create index for faster querying by supplier review status
CREATE INDEX IF NOT EXISTS idx_products_supplier_review_status ON products(supplier_review_status) WHERE supplier_review_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_assigned_to_supplier ON products(supplier_id, assigned_to_supplier_at) WHERE assigned_to_supplier_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN products.assigned_to_supplier_at IS 'Timestamp when admin assigned product to supplier for review';
COMMENT ON COLUMN products.supplier_review_status IS 'Status of supplier review: pending_supplier_review, supplier_in_progress, supplier_submitted, completed';
COMMENT ON COLUMN products.supplier_pricing_completed IS 'Whether supplier has completed pricing section (supplier_price, margin_split_percentage)';
COMMENT ON COLUMN products.supplier_inventory_completed IS 'Whether supplier has completed inventory section (icc_available_quantity, warehouses)';
COMMENT ON COLUMN products.supplier_documents_completed IS 'Whether supplier has completed documents section (sds_url, label_url)';
