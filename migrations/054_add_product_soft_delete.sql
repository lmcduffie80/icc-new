-- Migration: Add soft delete support to products table
-- This allows products to be marked as deleted while preserving referential integrity
-- with inventory_transactions and other related tables.

-- Add deleted_at column (NULL = active, timestamp = deleted)
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add deleted_by column to track which admin deleted the product
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Create index on deleted_at for efficient filtering
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;

-- Add comment to document the soft delete pattern
COMMENT ON COLUMN products.deleted_at IS 'Soft delete timestamp. NULL = active, timestamp = deleted';
COMMENT ON COLUMN products.deleted_by IS 'Admin user ID who soft deleted the product';
