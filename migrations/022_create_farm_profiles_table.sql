-- Farm profiles table for storing farm information associated with users
CREATE TABLE IF NOT EXISTS farm_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  farm_name TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  crop_types TEXT NOT NULL,
  farm_acres TEXT NOT NULL CHECK (farm_acres IN ('1-99', '100-249', '250-500', '500+')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_farm_profiles_user_id ON farm_profiles(user_id);
