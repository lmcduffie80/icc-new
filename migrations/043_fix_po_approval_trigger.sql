-- ============================================================================
-- Fix PO Approval Trigger Logic
-- Removes the broken BEFORE UPDATE trigger that was preventing $25K+ POs
-- from being properly flagged for approval
-- ============================================================================

-- Problem: The BEFORE UPDATE trigger (check_po_approval_threshold) was checking
-- if NEW.status IN ('DRAFT', 'APPROVED'), but by the time it runs, NEW.status
-- is already 'SUBMITTED' from the application's UPDATE query. This caused the
-- condition to fail and prevented approval requests from being created.

-- Solution: Drop the redundant BEFORE UPDATE trigger. The application code
-- already handles the threshold check correctly:
-- 1. Application checks if total_amount >= $25,000
-- 2. Application updates status from 'DRAFT' to 'SUBMITTED'  
-- 3. AFTER UPDATE trigger (create_po_approval_request) fires
-- 4. AFTER trigger creates approval request with assigned_to = Lee McDuffie

-- Drop the problematic BEFORE UPDATE trigger
DROP TRIGGER IF EXISTS trigger_check_po_approval_threshold ON purchase_orders;
DROP FUNCTION IF EXISTS check_po_approval_threshold() CASCADE;

-- The AFTER UPDATE trigger (create_po_approval_request) is sufficient and correct:
-- - Created in migration 033_create_po_approval_system.sql
-- - Enhanced in migration 036 & 037 to assign high-value POs to Lee McDuffie
-- - Fires when status changes to 'SUBMITTED'
-- - Creates approval request with threshold and assigned_to fields
-- - Works correctly with application code

-- No replacement needed - the flow is now:
-- Application Code → UPDATE status='SUBMITTED' → AFTER Trigger → Create Approval Request

COMMENT ON TABLE po_approval_requests IS 'Tracks pending and completed approval requests for purchase orders. POs over $25,000 require approval and are automatically assigned to Lee McDuffie.';
