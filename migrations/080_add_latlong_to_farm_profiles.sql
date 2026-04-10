-- Add precise lat/lng coordinates to farm_profiles.
-- Populated at profile save time via Google Maps Geocoding API.
-- NULL for existing rows until the grower next saves their profile.
ALTER TABLE farm_profiles
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
