-- Supplier users table (separate auth from customers and admins)
CREATE TABLE IF NOT EXISTS supplier_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplier sessions table
CREATE TABLE IF NOT EXISTS supplier_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_user_id TEXT NOT NULL REFERENCES supplier_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add supplier_id to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES supplier_users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'admin_approved', 'label_pending_supplier_approval', 'supplier_approved', 'rejected', 'published'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_url TEXT; -- Supplier's original label URL
ALTER TABLE products ADD COLUMN IF NOT EXISTS sds_url TEXT; -- Supplier's SDS URL
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_label_url TEXT; -- Admin's modified label URL (for store display)
ALTER TABLE products ADD COLUMN IF NOT EXISTS approval_notes TEXT; -- Notes from admin during approval
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_price DECIMAL(10,2); -- Supplier's base price
ALTER TABLE products ADD COLUMN IF NOT EXISTS icc_available_quantity INTEGER DEFAULT 0; -- Quantity available to ICC

-- Supplier warehouses table (warehouses owned/managed by suppliers)
CREATE TABLE IF NOT EXISTS supplier_warehouses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id TEXT NOT NULL REFERENCES supplier_users(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(supplier_id, warehouse_id)
);

-- Product approval history table (track approval workflow)
CREATE TABLE IF NOT EXISTS product_approval_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'admin_approved', 'label_modified', 'supplier_approved_label', 'supplier_rejected_label', 'published', 'rejected')),
  performed_by TEXT, -- supplier_user_id or 'admin'
  notes TEXT,
  label_url TEXT, -- Label URL at time of action (if applicable)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Label approval tokens table (for email-based approval workflow)
CREATE TABLE IF NOT EXISTS label_approval_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES supplier_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_supplier_users_email ON supplier_users(email);
CREATE INDEX IF NOT EXISTS idx_supplier_users_is_active ON supplier_users(is_active);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_token ON supplier_sessions(token);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_supplier_user_id ON supplier_sessions(supplier_user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_expires_at ON supplier_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_approval_status ON products(approval_status);
CREATE INDEX IF NOT EXISTS idx_supplier_warehouses_supplier_id ON supplier_warehouses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_warehouses_warehouse_id ON supplier_warehouses(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_product_approval_history_product_id ON product_approval_history(product_id);
CREATE INDEX IF NOT EXISTS idx_label_approval_tokens_token ON label_approval_tokens(token);
CREATE INDEX IF NOT EXISTS idx_label_approval_tokens_product_id ON label_approval_tokens(product_id);

-- Update existing products to be published (assuming they were manually approved before)
UPDATE products SET approval_status = 'published' WHERE supplier_id IS NULL AND approval_status = 'pending';

