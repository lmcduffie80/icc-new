-- Widen timing_label column to accommodate AI-generated descriptions
-- that include environmental context (soil temp, weather, spray windows)
ALTER TABLE farmer_plan_passes
  ALTER COLUMN timing_label TYPE VARCHAR(500);
