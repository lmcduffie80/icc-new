-- Migration: Add partner_type to supplier_contracts
-- Description: Allows contracts to be created for both suppliers and vendors
--              by dropping the FK on supplier_id and adding a partner_type discriminator

-- Drop the foreign key constraint so supplier_id can store either a supplier_users.id or vendors.id
ALTER TABLE supplier_contracts DROP CONSTRAINT IF EXISTS supplier_contracts_supplier_id_fkey;

-- Add partner_type column to discriminate between supplier and vendor contracts
ALTER TABLE supplier_contracts ADD COLUMN IF NOT EXISTS partner_type TEXT NOT NULL DEFAULT 'supplier';

-- Add CHECK constraint for valid partner types (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_partner_type' AND conrelid = 'supplier_contracts'::regclass
  ) THEN
    ALTER TABLE supplier_contracts ADD CONSTRAINT valid_partner_type CHECK (partner_type IN ('supplier', 'vendor'));
  END IF;
END $$;

-- Index for efficient filtering by partner type
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_partner_type ON supplier_contracts(partner_type);

COMMENT ON COLUMN supplier_contracts.partner_type IS 'Identifies whether the contract partner is a supplier (supplier_users) or vendor (vendors)';
