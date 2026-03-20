-- Migration: Add DocuSign tracking fields to supplier_contracts table
-- Description: Adds DocuSign envelope tracking for contract e-signature workflow

-- Add DocuSign tracking fields to supplier_contracts table
ALTER TABLE supplier_contracts
ADD COLUMN docusign_envelope_id TEXT,
ADD COLUMN docusign_envelope_status TEXT,
ADD COLUMN docusign_admin_signing_url TEXT,
ADD COLUMN docusign_supplier_signing_url TEXT,
ADD COLUMN docusign_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN docusign_completed_at TIMESTAMP WITH TIME ZONE;

-- Index for webhook lookups
CREATE INDEX idx_supplier_contracts_envelope_id 
ON supplier_contracts(docusign_envelope_id) 
WHERE docusign_envelope_id IS NOT NULL;

-- Add new status for DocuSign workflow
ALTER TABLE supplier_contracts 
DROP CONSTRAINT valid_status;

ALTER TABLE supplier_contracts
ADD CONSTRAINT valid_status CHECK (
  status IN (
    'draft', 
    'pending_signatures',  -- New: sent to DocuSign
    'pending_supplier_signature', 
    'active', 
    'expired', 
    'superseded',
    'signing_failed'  -- New: DocuSign error
  )
);

-- Comments
COMMENT ON COLUMN supplier_contracts.docusign_envelope_id IS 'DocuSign envelope ID for tracking signature status';
COMMENT ON COLUMN supplier_contracts.docusign_envelope_status IS 'DocuSign envelope status (sent, delivered, signed, completed, voided)';
COMMENT ON COLUMN supplier_contracts.docusign_admin_signing_url IS 'Embedded signing URL for admin (single use)';
COMMENT ON COLUMN supplier_contracts.docusign_supplier_signing_url IS 'Remote signing URL for supplier (sent via email)';
COMMENT ON COLUMN supplier_contracts.docusign_sent_at IS 'Timestamp when envelope was sent to DocuSign';
COMMENT ON COLUMN supplier_contracts.docusign_completed_at IS 'Timestamp when all parties completed signing';
