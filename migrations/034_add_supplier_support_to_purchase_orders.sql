-- Add supplier_id support to purchase_orders table
-- This allows purchase orders to be assigned to either a vendor or a supplier

-- Make vendor_id nullable (existing orders will keep their vendor_id)
ALTER TABLE purchase_orders
  ALTER COLUMN vendor_id DROP NOT NULL;

-- Add supplier_id column (nullable, references supplier_users)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES supplier_users(id) ON DELETE RESTRICT;

-- Create index for supplier_id
CREATE INDEX IF NOT EXISTS idx_po_supplier_id ON purchase_orders(supplier_id);

-- Add check constraint to ensure exactly one of vendor_id or supplier_id is set
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_vendor_or_supplier_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_vendor_or_supplier_check
  CHECK (
    (vendor_id IS NOT NULL AND supplier_id IS NULL) OR
    (vendor_id IS NULL AND supplier_id IS NOT NULL)
  );

-- Add comment for documentation
COMMENT ON COLUMN purchase_orders.supplier_id IS 'Supplier user ID (alternative to vendor_id). Exactly one of vendor_id or supplier_id must be set.';

