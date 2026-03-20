-- User Invoices Migration
-- This migration creates a table for storing farmer invoice uploads
-- Invoices are used to validate checkout shipping state eligibility

-- User Invoices table: Store user's farm invoices for checkout verification
CREATE TABLE IF NOT EXISTS user_invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  state CHAR(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  file_url TEXT NOT NULL,
  filename TEXT NOT NULL CHECK (length(filename) > 0 AND length(filename) <= 255),
  file_type TEXT NOT NULL CHECK (file_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_invoices_user_id ON user_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_invoices_user_state ON user_invoices(user_id, state);
CREATE INDEX IF NOT EXISTS idx_user_invoices_created_at ON user_invoices(user_id, created_at DESC);

-- Trigger to auto-update updated_at (uses existing function from migration 014)
DROP TRIGGER IF EXISTS update_user_invoices_updated_at ON user_invoices;
CREATE TRIGGER update_user_invoices_updated_at
  BEFORE UPDATE ON user_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_invoices IS 'Stores farmer invoice uploads for checkout state validation';
COMMENT ON COLUMN user_invoices.state IS '2-letter US state code from the invoice';
COMMENT ON COLUMN user_invoices.file_url IS 'S3 URL to the uploaded invoice file';
COMMENT ON COLUMN user_invoices.filename IS 'Original filename of the uploaded invoice';
COMMENT ON COLUMN user_invoices.file_type IS 'MIME type of the uploaded file';
