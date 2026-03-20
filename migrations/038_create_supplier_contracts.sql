-- Migration: Create supplier contracts table
-- Description: Adds contract management for suppliers with digital signing workflow

CREATE TABLE supplier_contracts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id TEXT NOT NULL REFERENCES supplier_users(id) ON DELETE CASCADE,
  
  -- File information
  file_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- Contract metadata
  contract_type TEXT NOT NULL,
  contract_date DATE NOT NULL,
  expiry_date DATE,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft, pending_supplier_signature, active, expired, superseded
  
  -- Admin signature
  admin_signed_at TIMESTAMP WITH TIME ZONE,
  admin_signed_by TEXT REFERENCES admin_users(id),
  
  -- Supplier signature
  supplier_signed_at TIMESTAMP WITH TIME ZONE,
  supplier_signed_by TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('draft', 'pending_supplier_signature', 'active', 'expired', 'superseded'))
);

-- Indexes for efficient queries
CREATE INDEX idx_supplier_contracts_supplier_id ON supplier_contracts(supplier_id);
CREATE INDEX idx_supplier_contracts_status ON supplier_contracts(status);
CREATE INDEX idx_supplier_contracts_expiry_date ON supplier_contracts(expiry_date);

-- Comment on table
COMMENT ON TABLE supplier_contracts IS 'Stores supplier contracts with digital signing workflow and version tracking';
