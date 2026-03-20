-- Add FreightQuote integration fields to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS freight_quote_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
