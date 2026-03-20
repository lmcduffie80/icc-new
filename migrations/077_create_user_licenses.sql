-- Create user_licenses table to store pesticide applicator license uploads.
-- When a cart contains a restricted-use product, the customer must upload
-- their applicator license before checkout can proceed.

CREATE TABLE IF NOT EXISTS user_licenses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  license_url TEXT NOT NULL,
  license_state TEXT,
  license_filename TEXT,
  license_file_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_licenses_user_id ON user_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_licenses_uploaded_at ON user_licenses(uploaded_at DESC);
