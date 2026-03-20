-- Add metadata column to orders table for storing invoice information
-- This column will store invoice upload details as JSONB for flexibility

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for efficient JSON queries on invoice metadata
-- This allows fast lookups of orders by invoice attributes
CREATE INDEX IF NOT EXISTS idx_orders_metadata_invoice
ON orders USING GIN ((metadata -> 'invoice'));

-- Add comment for documentation
COMMENT ON COLUMN orders.metadata IS 'JSONB column storing order metadata including invoice information: {invoice_url, invoice_state, invoice_uploaded_at, invoice_filename, invoice_file_type}';
