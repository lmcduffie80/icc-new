-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  address_street TEXT NOT NULL,
  address_city TEXT NOT NULL,
  address_state TEXT NOT NULL,
  address_zip TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product warehouses table (inventory at different warehouses)
CREATE TABLE IF NOT EXISTS product_warehouses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  inventory_count INTEGER NOT NULL DEFAULT 0,
  warehouse_location TEXT, -- Physical location within warehouse (e.g., A-12-B)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

-- Add warehouse_id to orders for BOL generation
ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_id TEXT REFERENCES warehouses(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_warehouses_is_active ON warehouses(is_active);
CREATE INDEX IF NOT EXISTS idx_product_warehouses_product_id ON product_warehouses(product_id);
CREATE INDEX IF NOT EXISTS idx_product_warehouses_warehouse_id ON product_warehouses(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_id ON orders(warehouse_id);

