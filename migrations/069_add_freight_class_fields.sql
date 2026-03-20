-- Migration 069: Add freight class fields to products
-- freight_class stores the accepted freight class (e.g., "55", "65", "70")
-- freight_class_ai_suggestion stores Claude's suggestion pending admin review

ALTER TABLE products ADD COLUMN IF NOT EXISTS freight_class TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS freight_class_ai_suggestion TEXT;

COMMENT ON COLUMN products.freight_class IS 'LTL freight class for this product (e.g. "55", "65", "70"). Set manually or accepted from AI suggestion.';
COMMENT ON COLUMN products.freight_class_ai_suggestion IS 'Claude-suggested freight class awaiting admin review. Copied to freight_class on accept.';
