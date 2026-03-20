-- Migration: 048_add_admin_margin_proposal.sql
-- Description: Adds admin-initiated margin proposal functionality with supplier approval workflow

-- Add columns for admin-initiated margin proposals
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_proposed_margin_percent DECIMAL(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_proposed_margin_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_proposed_margin_by TEXT REFERENCES admin_users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_proposal_source TEXT DEFAULT 'supplier' CHECK (margin_proposal_source IN ('supplier', 'admin'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_margin_approval_status TEXT DEFAULT 'pending' CHECK (supplier_margin_approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_margin_approval_notes TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_margin_approved_at TIMESTAMPTZ;

-- Update margin_approval_history action types to support new workflows
ALTER TABLE margin_approval_history DROP CONSTRAINT IF EXISTS margin_approval_history_action_check;
ALTER TABLE margin_approval_history ADD CONSTRAINT margin_approval_history_action_check 
  CHECK (action IN ('submitted', 'approved', 'rejected', 'updated', 'admin_proposed', 'supplier_approved_admin_margin', 'supplier_rejected_admin_margin'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_margin_proposal_source ON products(margin_proposal_source);
CREATE INDEX IF NOT EXISTS idx_products_supplier_margin_approval_status ON products(supplier_margin_approval_status);
CREATE INDEX IF NOT EXISTS idx_products_admin_proposed_margin_by ON products(admin_proposed_margin_by);

-- Add comments for documentation
COMMENT ON COLUMN products.admin_proposed_margin_percent IS 'Margin percentage proposed by admin (when admin initiates margin change)';
COMMENT ON COLUMN products.admin_proposed_margin_at IS 'Timestamp when admin proposed the margin';
COMMENT ON COLUMN products.admin_proposed_margin_by IS 'Admin user ID who proposed the margin';
COMMENT ON COLUMN products.margin_proposal_source IS 'Who initiated the margin proposal: supplier or admin';
COMMENT ON COLUMN products.supplier_margin_approval_status IS 'Supplier approval status when admin proposes margin (pending, approved, rejected)';
COMMENT ON COLUMN products.supplier_margin_approval_notes IS 'Supplier notes when approving or rejecting admin-proposed margin';
COMMENT ON COLUMN products.supplier_margin_approved_at IS 'Timestamp when supplier approved or rejected admin-proposed margin';
