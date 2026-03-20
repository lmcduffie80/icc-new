-- ============================================================================
-- Purchase Order Approval System
-- Creates tables and functions for tracking PO approvals
-- ============================================================================

-- PO Approval Requests table
CREATE TABLE IF NOT EXISTS po_approval_requests (
  id                BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  requested_by      TEXT, -- Admin user ID who submitted the PO
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_by       TEXT, -- Admin user ID who approved/rejected
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT, -- Optional reason for rejection
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_approval_requests_po_id ON po_approval_requests(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_approval_requests_status ON po_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_approval_requests_requested_at ON po_approval_requests(requested_at DESC);

-- PO Approval History (for audit trail)
CREATE TABLE IF NOT EXISTS po_approval_history (
  id                BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  action            TEXT NOT NULL CHECK (action IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'RESUBMITTED')),
  admin_user_id     TEXT, -- Admin user ID who performed the action
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_approval_history_po_id ON po_approval_history(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_approval_history_created_at ON po_approval_history(created_at DESC);

-- Function to create approval request when PO is submitted
CREATE OR REPLACE FUNCTION create_po_approval_request()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create approval request when status changes to SUBMITTED
  IF NEW.status = 'SUBMITTED' AND (OLD.status IS NULL OR OLD.status != 'SUBMITTED') THEN
    -- Check if there's already a pending approval request
    IF NOT EXISTS (
      SELECT 1 FROM po_approval_requests 
      WHERE purchase_order_id = NEW.id AND status = 'PENDING'
    ) THEN
      -- Create new approval request
      INSERT INTO po_approval_requests (purchase_order_id, requested_by, status)
      VALUES (NEW.id, NEW.buyer_user_id, 'PENDING');
      
      -- Log the submission
      INSERT INTO po_approval_history (purchase_order_id, action, admin_user_id, notes)
      VALUES (NEW.id, 'SUBMITTED', NEW.buyer_user_id, 'Purchase order submitted for approval');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically create approval request on status change
DROP TRIGGER IF EXISTS trigger_create_po_approval_request ON purchase_orders;
CREATE TRIGGER trigger_create_po_approval_request
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION create_po_approval_request();

-- Function to update PO status when approved/rejected
CREATE OR REPLACE FUNCTION process_po_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- When approval request is approved, update PO status to APPROVED
  IF NEW.status = 'APPROVED' AND OLD.status = 'PENDING' THEN
    UPDATE purchase_orders
    SET status = 'APPROVED', updated_at = NOW()
    WHERE id = NEW.purchase_order_id;
    
    -- Log the approval
    INSERT INTO po_approval_history (purchase_order_id, action, admin_user_id, notes)
    VALUES (NEW.purchase_order_id, 'APPROVED', NEW.approved_by, 'Purchase order approved');
  END IF;
  
  -- When approval request is rejected, update PO status back to DRAFT
  IF NEW.status = 'REJECTED' AND OLD.status = 'PENDING' THEN
    UPDATE purchase_orders
    SET status = 'DRAFT', updated_at = NOW()
    WHERE id = NEW.purchase_order_id;
    
    -- Log the rejection
    INSERT INTO po_approval_history (purchase_order_id, action, admin_user_id, notes)
    VALUES (NEW.purchase_order_id, 'REJECTED', NEW.approved_by, COALESCE(NEW.rejection_reason, 'Purchase order rejected'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to process approval decisions
DROP TRIGGER IF EXISTS trigger_process_po_approval ON po_approval_requests;
CREATE TRIGGER trigger_process_po_approval
  AFTER UPDATE OF status ON po_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION process_po_approval();

COMMENT ON TABLE po_approval_requests IS 'Tracks pending and completed approval requests for purchase orders';
COMMENT ON TABLE po_approval_history IS 'Audit trail of all approval actions for purchase orders';

