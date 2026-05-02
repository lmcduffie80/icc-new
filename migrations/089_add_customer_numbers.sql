-- Migration 089: Add auto-assigned customer numbers to user profiles
-- Customer numbers follow the format ICC-XXXX (e.g. ICC-1000)
-- A PostgreSQL sequence drives auto-generation; existing rows are backfilled.

-- 1. Create the sequence (starts at 1000 so the first number is ICC-1000)
CREATE SEQUENCE IF NOT EXISTS customer_number_seq
  START WITH 1000
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- 2. Add the column to user_profiles (nullable to allow safe backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'customer_number'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN customer_number VARCHAR(20);
  END IF;
END $$;

-- 3. Backfill all existing profiles that don't have a customer number yet
UPDATE user_profiles
SET customer_number = 'ICC-' || LPAD(nextval('customer_number_seq')::text, 4, '0')
WHERE customer_number IS NULL;

-- 4. Now that backfill is done, add the UNIQUE constraint
--    (idempotent: skip if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_customer_number_key'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_customer_number_key UNIQUE (customer_number);
  END IF;
END $$;

-- 5. Trigger function: auto-assign customer_number on INSERT when one isn't supplied
CREATE OR REPLACE FUNCTION assign_customer_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_number IS NULL THEN
    NEW.customer_number := 'ICC-' || LPAD(nextval('customer_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop + recreate trigger so this migration is safely re-runnable
DROP TRIGGER IF EXISTS trigger_assign_customer_number ON user_profiles;
CREATE TRIGGER trigger_assign_customer_number
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_customer_number();

-- 6. Index for quick lookup by customer number
CREATE INDEX IF NOT EXISTS idx_user_profiles_customer_number ON user_profiles(customer_number);

COMMENT ON COLUMN user_profiles.customer_number IS 'Auto-assigned human-readable customer identifier (ICC-XXXX format)';
COMMENT ON SEQUENCE customer_number_seq IS 'Sequence backing ICC customer number generation. Starts at 1000.';
