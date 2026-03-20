-- Migration 068: Add AI NMFC classification fields to products
-- These columns store Claude's suggested NMFC number and the admin review state.
-- The nmfc_number column (from migration 067) is only updated when an admin explicitly accepts the suggestion.

ALTER TABLE products ADD COLUMN IF NOT EXISTS nmfc_ai_suggestion TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS nmfc_ai_reasoning TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS nmfc_ai_status TEXT
  CHECK (nmfc_ai_status IN ('pending', 'accepted', 'rejected'));

COMMENT ON COLUMN products.nmfc_ai_suggestion IS 'Claude-suggested NMFC number awaiting admin review';
COMMENT ON COLUMN products.nmfc_ai_reasoning IS 'Claude reasoning for the suggested NMFC classification';
COMMENT ON COLUMN products.nmfc_ai_status IS 'Admin review state for the AI suggestion: pending, accepted, or rejected';
