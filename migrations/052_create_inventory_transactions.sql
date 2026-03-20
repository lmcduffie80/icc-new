-- Migration: Create inventory_transactions table
-- Description: Tracks all inventory movements (goods receipts, issues, transfers, adjustments)
--              Similar to SAP MB51 Material Document List report

-- Create enum type for transaction types
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'goods_receipt',      -- 101: GR from purchase order
    'goods_issue',        -- 261: GI for order fulfillment
    'transfer',           -- 311: Transfer between warehouses
    'adjustment_positive',-- 701: Inventory count increase
    'adjustment_negative',-- 702: Inventory count decrease
    'return_from_customer',-- 161: Return to warehouse
    'return_to_supplier'  -- 122: Return to supplier/vendor
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create inventory_transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Transaction identification
  transaction_number TEXT NOT NULL UNIQUE, -- Auto-generated material document number (e.g., MAT-2024-00001)
  transaction_type transaction_type NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Material/Product information
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  
  -- Quantity and unit
  quantity DECIMAL(10, 2) NOT NULL, -- Positive for receipts/returns, negative for issues/adjustments out
  unit_of_measure TEXT NOT NULL,
  
  -- Warehouse/Location information
  warehouse_id TEXT REFERENCES warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT,
  storage_location TEXT, -- Physical location within warehouse
  
  -- Transfer-specific (for warehouse transfers)
  from_warehouse_id TEXT REFERENCES warehouses(id) ON DELETE RESTRICT,
  from_warehouse_name TEXT,
  to_warehouse_id TEXT REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_name TEXT,
  
  -- Supplier/Vendor information (for receipts and returns)
  supplier_id TEXT, -- References either supplier_users.id or vendors.id
  supplier_name TEXT,
  partner_type TEXT, -- 'supplier' or 'vendor'
  
  -- Reference documents
  reference_doc_type TEXT, -- 'order', 'purchase_order', 'adjustment', 'transfer'
  reference_doc_id TEXT, -- ID of the referenced document
  reference_doc_number TEXT, -- Human-readable document number (e.g., ORD-123, PO-456)
  
  -- Financial tracking
  unit_cost DECIMAL(10, 2), -- Cost per unit at time of transaction
  total_cost DECIMAL(10, 2), -- Total cost (quantity × unit_cost)
  
  -- User tracking
  created_by_id TEXT, -- admin_users.id who created the transaction
  created_by_username TEXT,
  
  -- Additional information
  notes TEXT, -- Reason for adjustment, transfer notes, etc.
  batch_number TEXT, -- Batch/lot number if applicable
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying (mirroring MB51 common filters)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_transaction_date 
  ON inventory_transactions(transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_posting_date 
  ON inventory_transactions(posting_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_transaction_type 
  ON inventory_transactions(transaction_type);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id 
  ON inventory_transactions(product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse_id 
  ON inventory_transactions(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_supplier_id 
  ON inventory_transactions(supplier_id) 
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference_doc 
  ON inventory_transactions(reference_doc_type, reference_doc_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_transaction_number 
  ON inventory_transactions(transaction_number);

-- Composite index for common reporting queries
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reporting 
  ON inventory_transactions(posting_date DESC, transaction_type, warehouse_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_inventory_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_inventory_transactions_updated_at ON inventory_transactions;
CREATE TRIGGER trigger_update_inventory_transactions_updated_at
  BEFORE UPDATE ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_transactions_updated_at();

-- Add comments for documentation
COMMENT ON TABLE inventory_transactions IS 'Tracks all inventory movements similar to SAP MB51 Material Document List';
COMMENT ON COLUMN inventory_transactions.transaction_number IS 'Unique material document number (auto-generated)';
COMMENT ON COLUMN inventory_transactions.transaction_type IS 'Type of inventory movement: goods_receipt, goods_issue, transfer, adjustment, return';
COMMENT ON COLUMN inventory_transactions.quantity IS 'Quantity moved (positive for receipts/increases, negative for issues/decreases)';
COMMENT ON COLUMN inventory_transactions.reference_doc_type IS 'Type of document that triggered this transaction';
COMMENT ON COLUMN inventory_transactions.reference_doc_id IS 'ID of the document that triggered this transaction';
COMMENT ON COLUMN inventory_transactions.partner_type IS 'Whether supplier_id references a supplier or vendor';
COMMENT ON COLUMN inventory_transactions.unit_cost IS 'Cost per unit at the time of transaction (for valuation reporting)';

-- Create sequence for transaction numbering
CREATE SEQUENCE IF NOT EXISTS inventory_transaction_sequence START 1;

-- Function to generate transaction numbers (MAT-YYYY-NNNNN)
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  seq_part TEXT;
  transaction_num TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_part := LPAD(nextval('inventory_transaction_sequence')::TEXT, 5, '0');
  transaction_num := 'MAT-' || year_part || '-' || seq_part;
  RETURN transaction_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate transaction number if not provided
CREATE OR REPLACE FUNCTION set_transaction_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = '' THEN
    NEW.transaction_number := generate_transaction_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_transaction_number ON inventory_transactions;
CREATE TRIGGER trigger_set_transaction_number
  BEFORE INSERT ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_number();
