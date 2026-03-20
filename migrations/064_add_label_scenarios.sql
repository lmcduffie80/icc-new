-- Migration 064: Add label_scenarios JSONB column to acre_pack_pass_products
-- Stores an array of { label, rate } objects for display as a reference table in the public builder

ALTER TABLE acre_pack_pass_products
  ADD COLUMN IF NOT EXISTS label_scenarios JSONB DEFAULT NULL;
