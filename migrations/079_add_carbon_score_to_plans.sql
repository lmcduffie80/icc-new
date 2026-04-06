-- Add carbon_score JSONB column to farmer_crop_plans
-- Stores the full CarbonScore object computed when a plan's passes are saved
ALTER TABLE farmer_crop_plans
  ADD COLUMN carbon_score JSONB;
