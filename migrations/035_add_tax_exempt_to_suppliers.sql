-- Add tax_exempt column to supplier_users table
-- This allows suppliers to be marked as tax exempt, similar to vendors

-- Add tax_exempt column (defaults to false)
ALTER TABLE supplier_users
  ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for tax_exempt lookups
CREATE INDEX IF NOT EXISTS idx_supplier_users_tax_exempt ON supplier_users(tax_exempt) WHERE tax_exempt = true;

-- Add comment for documentation
COMMENT ON COLUMN supplier_users.tax_exempt IS 'Whether this supplier is tax exempt (defaults to false)';

