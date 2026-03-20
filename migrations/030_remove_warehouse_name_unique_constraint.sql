-- Remove unique constraint on warehouse names
-- This allows multiple suppliers to use warehouses with the same name
-- since they may share the same physical warehouse facility

-- Drop the unique constraint on warehouses.name
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_name_key;

-- Also drop any unique index on name if it exists
DROP INDEX IF EXISTS warehouses_name_key;

-- Add a comment to document why names are not unique
COMMENT ON COLUMN warehouses.name IS 'Warehouse name - not unique, as multiple suppliers may share the same physical warehouse facility';
