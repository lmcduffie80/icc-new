-- Migration: Update default bill-to address to Atlanta business location
-- Description: Updates the ICC bill-to address from Tifton to Atlanta office

BEGIN;

-- Update the default BILL_TO address for Innovative CropCare, LLC
UPDATE addresses
SET 
  address1 = '3800 Camp Creek Pkwy',
  address2 = 'Building 1400',
  city = 'Atlanta',
  state = 'GA',
  zip_code = '30331',
  updated_at = NOW()
WHERE 
  type = 'BILL_TO' 
  AND company_name = 'Innovative CropCare, LLC'
  AND address1 = '181 Cedar Ridge Rd'
  AND city = 'Tifton'
  AND state = 'GA';

-- Verify the update (idempotent - address may already be set)
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM addresses
  WHERE type = 'BILL_TO' 
    AND company_name = 'Innovative CropCare, LLC'
    AND address1 = '3800 Camp Creek Pkwy'
    AND city = 'Atlanta';
  
  RAISE NOTICE 'Bill-to address records with Atlanta address: %', updated_count;
END $$;

COMMIT;
