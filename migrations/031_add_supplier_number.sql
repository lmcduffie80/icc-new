-- Add supplier_number to supplier_users table
-- This is a unique identifier for each supplier (e.g., 100001, 100002)
-- Auto-generated using a sequence and trigger

-- Create sequence for supplier numbers starting at 100001
CREATE SEQUENCE IF NOT EXISTS supplier_number_seq START WITH 100001;

-- Add supplier_number column
ALTER TABLE supplier_users 
ADD COLUMN IF NOT EXISTS supplier_number TEXT UNIQUE;

-- Create function to generate supplier number
CREATE OR REPLACE FUNCTION generate_supplier_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  supplier_num TEXT;
BEGIN
  -- Only generate if supplier_number is not already set
  IF NEW.supplier_number IS NULL OR NEW.supplier_number = '' THEN
    -- Get next sequence value
    next_num := nextval('supplier_number_seq');
    -- Format as 6-digit number (100001, 100002, etc.)
    supplier_num := LPAD(next_num::TEXT, 6, '0');
    
    -- Ensure uniqueness (in case of race conditions)
    WHILE EXISTS (SELECT 1 FROM supplier_users WHERE supplier_number = supplier_num) LOOP
      next_num := nextval('supplier_number_seq');
      supplier_num := LPAD(next_num::TEXT, 6, '0');
    END LOOP;
    
    NEW.supplier_number := supplier_num;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate supplier number on insert
DROP TRIGGER IF EXISTS trigger_generate_supplier_number ON supplier_users;
CREATE TRIGGER trigger_generate_supplier_number
  BEFORE INSERT ON supplier_users
  FOR EACH ROW
  EXECUTE FUNCTION generate_supplier_number();

-- Backfill existing suppliers with numbers if they don't have one
DO $$
DECLARE
  supplier_record RECORD;
  next_num INTEGER;
  supplier_num TEXT;
  max_existing_num INTEGER;
BEGIN
  -- Find the maximum existing 6-digit supplier number
  SELECT COALESCE(MAX(CAST(supplier_number AS INTEGER)), 0)
  INTO max_existing_num
  FROM supplier_users
  WHERE supplier_number IS NOT NULL 
    AND supplier_number ~ '^\d{6}$'
    AND CAST(supplier_number AS INTEGER) >= 100001;
  
  -- Set sequence to start from max existing number + 1, but at least 100001
  IF max_existing_num >= 100001 THEN
    PERFORM setval('supplier_number_seq', max_existing_num + 1, false);
  ELSE
    PERFORM setval('supplier_number_seq', 100001, false);
  END IF;
  
  -- Generate numbers for suppliers without one
  FOR supplier_record IN 
    SELECT id FROM supplier_users WHERE supplier_number IS NULL OR supplier_number = '' OR supplier_number !~ '^\d{6}$'
  LOOP
    next_num := nextval('supplier_number_seq');
    supplier_num := LPAD(next_num::TEXT, 6, '0');
    
    -- Ensure uniqueness and that it's at least 100001
    WHILE EXISTS (SELECT 1 FROM supplier_users WHERE supplier_number = supplier_num) OR next_num < 100001 LOOP
      IF next_num < 100001 THEN
        next_num := 100001;
        PERFORM setval('supplier_number_seq', 100001, false);
      END IF;
      next_num := nextval('supplier_number_seq');
      supplier_num := LPAD(next_num::TEXT, 6, '0');
    END LOOP;
    
    UPDATE supplier_users 
    SET supplier_number = supplier_num 
    WHERE id = supplier_record.id;
  END LOOP;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_supplier_users_supplier_number ON supplier_users(supplier_number) WHERE supplier_number IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN supplier_users.supplier_number IS 'Auto-generated unique supplier identifier (6-digit number starting at 100001, e.g., 100001, 100002)';
COMMENT ON SEQUENCE supplier_number_seq IS 'Sequence for auto-generating supplier numbers starting at 100001';

