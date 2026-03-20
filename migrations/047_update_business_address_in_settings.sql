-- Migration: Update business address in settings to match bill-to address
-- Description: Syncs the customer-facing business address with the Atlanta office address

BEGIN;

-- Update or insert the store_info settings with Atlanta business address
INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'store_info',
  jsonb_build_object(
    'store_name', 'Innovative Crop Care',
    'phone', '1-800-CROP-CARE',
    'email', 'info@innovativecropcare.com',
    'support_email', 'support@innovativecropcare.com',
    'address_street', '3800 Camp Creek Pkwy, Building 1400',
    'address_city', 'Atlanta',
    'address_state', 'GA',
    'address_zip', '30331',
    'business_hours', 'Mon-Fri, 8AM-6PM EST'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          site_settings.value,
          '{address_street}', to_jsonb('3800 Camp Creek Pkwy, Building 1400'::text)
        ),
        '{address_city}', to_jsonb('Atlanta'::text)
      ),
      '{address_state}', to_jsonb('GA'::text)
    ),
    '{address_zip}', to_jsonb('30331'::text)
  ),
  updated_at = NOW();

-- Verify the update
DO $$
DECLARE
  current_address TEXT;
BEGIN
  SELECT value->>'address_city' INTO current_address
  FROM site_settings
  WHERE key = 'store_info';
  
  IF current_address IS NULL OR current_address != 'Atlanta' THEN
    RAISE EXCEPTION 'Business address update failed - expected Atlanta, got %', current_address;
  END IF;
  
  RAISE NOTICE 'Successfully updated business address in settings to Atlanta';
END $$;

COMMIT;
