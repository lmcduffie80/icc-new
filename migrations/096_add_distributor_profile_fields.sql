-- Migration 096: Add company profile fields to distributor accounts
-- Stores company name, EIN, and W9 document URL alongside distributor status.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_company_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_ein TEXT;          -- format: XX-XXXXXXX
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_w9_url TEXT;       -- S3 presigned or permanent URL
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_w9_uploaded_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS distributor_w9_filename TEXT;  -- original filename for display

COMMENT ON COLUMN user_profiles.distributor_company_name IS 'Legal business name of the distributor';
COMMENT ON COLUMN user_profiles.distributor_ein IS 'Employer Identification Number (EIN) in XX-XXXXXXX format';
COMMENT ON COLUMN user_profiles.distributor_w9_url IS 'S3 URL of the uploaded W9 form';
COMMENT ON COLUMN user_profiles.distributor_w9_filename IS 'Original filename of the W9 upload for display';
