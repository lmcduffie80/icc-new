-- Add compared_to field for storing comparable/competing product name
ALTER TABLE products ADD COLUMN IF NOT EXISTS compared_to TEXT;
