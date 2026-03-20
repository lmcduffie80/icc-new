-- Add columns to track FIFO allocations and product substitutions
-- This enables tracking which supplier's product was used and when it entered the warehouse

-- Add FIFO tracking columns to order_items
ALTER TABLE order_items 
  ADD COLUMN IF NOT EXISTS original_product_id TEXT,
  ADD COLUMN IF NOT EXISTS allocated_product_id TEXT,
  ADD COLUMN IF NOT EXISTS supplier_id TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_entry_date TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN order_items.original_product_id IS 'The product ID that was originally ordered';
COMMENT ON COLUMN order_items.allocated_product_id IS 'The actual product ID allocated (may differ if using like product from different supplier)';
COMMENT ON COLUMN order_items.supplier_id IS 'The supplier whose product was allocated';
COMMENT ON COLUMN order_items.warehouse_entry_date IS 'The date when the allocated inventory entered the warehouse (for FIFO verification)';

-- Add indexes for FIFO queries
CREATE INDEX IF NOT EXISTS idx_product_warehouses_created_at 
  ON product_warehouses(created_at ASC);

CREATE INDEX IF NOT EXISTS idx_products_name_in_stock 
  ON products(name, in_stock) 
  WHERE in_stock = true;

CREATE INDEX IF NOT EXISTS idx_order_items_supplier_id 
  ON order_items(supplier_id) 
  WHERE supplier_id IS NOT NULL;

-- Add index for finding like products efficiently
CREATE INDEX IF NOT EXISTS idx_products_name_supplier 
  ON products(name, supplier_id, in_stock);

-- Add index for FIFO warehouse queries (composite index for optimal performance)
CREATE INDEX IF NOT EXISTS idx_pw_fifo_allocation 
  ON product_warehouses(product_id, warehouse_id, created_at ASC) 
  WHERE inventory_count > 0;
