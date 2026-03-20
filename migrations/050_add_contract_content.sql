-- Migration: Add content JSONB and version chaining to supplier_contracts
-- Description: Supports in-app structured contracts alongside existing PDF contracts,
--              and links contract versions via parent_contract_id

-- Add content JSONB for structured contract data
ALTER TABLE supplier_contracts ADD COLUMN IF NOT EXISTS content JSONB;

-- Add parent_contract_id for version chaining
ALTER TABLE supplier_contracts ADD COLUMN IF NOT EXISTS parent_contract_id TEXT REFERENCES supplier_contracts(id) ON DELETE SET NULL;

-- Make file columns nullable (in-app contracts don't have a PDF)
ALTER TABLE supplier_contracts ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE supplier_contracts ALTER COLUMN filename DROP NOT NULL;
ALTER TABLE supplier_contracts ALTER COLUMN file_size DROP NOT NULL;

-- Index for version chain lookups
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_parent_id ON supplier_contracts(parent_contract_id) WHERE parent_contract_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN supplier_contracts.content IS 'Structured contract data (terms, products, pricing, margins) stored as JSONB for in-app contracts';
COMMENT ON COLUMN supplier_contracts.parent_contract_id IS 'Links to the previous version of this contract. NULL for v1 contracts.';
