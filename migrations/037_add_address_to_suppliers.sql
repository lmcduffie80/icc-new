-- Add address fields to supplier_users table
-- This allows supplier addresses to be stored and used on Purchase Orders

-- Add address columns (nullable to allow existing suppliers without addresses)
ALTER TABLE supplier_users
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_zip TEXT;

-- Add comment for documentation
COMMENT ON COLUMN supplier_users.address_street IS 'Street address of the supplier';
COMMENT ON COLUMN supplier_users.address_city IS 'City of the supplier';
COMMENT ON COLUMN supplier_users.address_state IS 'State of the supplier (2-letter code)';
COMMENT ON COLUMN supplier_users.address_zip IS 'ZIP code of the supplier';

