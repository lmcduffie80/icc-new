-- Update payment settings to increase max_order_amount for large freight orders
-- This allows orders up to $1,000,000 instead of the previous $10,000 limit

UPDATE site_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{max_order_amount}',
  '1000000'::jsonb,
  true
)
WHERE key = 'payment'
  AND (
    value->>'max_order_amount' IS NULL 
    OR (value->>'max_order_amount')::numeric < 1000000
  );

-- If payment settings don't exist, create them with the new max
INSERT INTO site_settings (key, value)
SELECT 'payment', '{"stripe_enabled": true, "min_order_amount": 10, "max_order_amount": 1000000, "allow_saved_cards": true, "send_receipt_emails": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'payment');

