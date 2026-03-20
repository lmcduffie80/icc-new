-- Tax Rates Migration
-- This migration creates the tax_rates table for state-based tax management

-- Tax Rates table: Store tax rates for US states with historical tracking
CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  state_code TEXT NOT NULL CHECK (length(state_code) = 2),
  rate DECIMAL(5, 4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tax_rates_state_code ON tax_rates(state_code);
CREATE INDEX IF NOT EXISTS idx_tax_rates_effective_date ON tax_rates(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_rates_is_active ON tax_rates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tax_rates_state_active ON tax_rates(state_code, is_active, effective_date DESC) WHERE is_active = true;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tax_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_tax_rates_updated_at ON tax_rates;
CREATE TRIGGER trigger_update_tax_rates_updated_at
  BEFORE UPDATE ON tax_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_rates_updated_at();

-- Add comments for documentation
COMMENT ON TABLE tax_rates IS 'Stores state-based tax rates with historical tracking';
COMMENT ON COLUMN tax_rates.state_code IS 'Two-letter US state abbreviation (e.g., CA, NY)';
COMMENT ON COLUMN tax_rates.rate IS 'Tax rate as decimal (e.g., 0.021 for 2.1%)';
COMMENT ON COLUMN tax_rates.effective_date IS 'Date when this tax rate becomes effective';
COMMENT ON COLUMN tax_rates.is_active IS 'Whether this rate is currently active';
COMMENT ON COLUMN tax_rates.created_by IS 'Admin user ID who created this rate';

-- Seed California tax rate at 2.1%
INSERT INTO tax_rates (state_code, rate, effective_date, is_active, created_by)
VALUES ('CA', 0.021, NOW(), true, 'system')
ON CONFLICT DO NOTHING;
