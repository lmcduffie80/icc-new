-- Fix the PO approval threshold functions to use 'email' instead of non-existent 'username' column
-- This corrects an error in migration 036

-- Drop and recreate the check_po_approval_threshold function with correct column reference
DROP FUNCTION IF EXISTS check_po_approval_threshold() CASCADE;

CREATE OR REPLACE FUNCTION check_po_approval_threshold()
RETURNS TRIGGER AS $$
DECLARE
  po_total NUMERIC(10,2);
  lee_admin_id TEXT;
BEGIN
  -- Get the total amount from the PO
  SELECT total_amount INTO po_total
  FROM purchase_orders
  WHERE id = NEW.id;
  
  -- Find Lee McDuffie's admin user ID (searching by name or email)
  SELECT id INTO lee_admin_id
  FROM admin_users
  WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(email) LIKE '%lee%'
  LIMIT 1;
  
  -- If PO total is over $25,000, automatically set status to SUBMITTED and create approval request
  IF po_total >= 25000 AND NEW.status IN ('DRAFT', 'APPROVED') AND (OLD.status IS NULL OR OLD.status != 'SUBMITTED') THEN
    -- Update PO status to SUBMITTED
    NEW.status := 'SUBMITTED';
    
    -- Create approval request (will be handled by existing trigger)
    -- But we'll update it to assign to Lee McDuffie
    PERFORM pg_notify('po_approval_needed', json_build_object(
      'po_id', NEW.id,
      'po_number', NEW.po_number,
      'total_amount', po_total,
      'assigned_to', lee_admin_id
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_check_po_approval_threshold ON purchase_orders;
CREATE TRIGGER trigger_check_po_approval_threshold
  BEFORE UPDATE OF total_amount, status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION check_po_approval_threshold();

-- Drop and recreate the create_po_approval_request function with correct column reference
DROP FUNCTION IF EXISTS create_po_approval_request() CASCADE;

CREATE OR REPLACE FUNCTION create_po_approval_request()
RETURNS TRIGGER AS $$
DECLARE
  lee_admin_id TEXT;
  po_total NUMERIC(10,2);
BEGIN
  -- Only create approval request when status changes to SUBMITTED
  IF NEW.status = 'SUBMITTED' AND (OLD.status IS NULL OR OLD.status != 'SUBMITTED') THEN
    -- Check if there's already a pending approval request
    IF NOT EXISTS (
      SELECT 1 FROM po_approval_requests 
      WHERE purchase_order_id = NEW.id AND status = 'PENDING'
    ) THEN
      -- Find Lee McDuffie's admin ID (searching by name or email)
      SELECT id INTO lee_admin_id
      FROM admin_users
      WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(email) LIKE '%lee%'
      LIMIT 1;
      
      -- Get PO total
      SELECT total_amount INTO po_total FROM purchase_orders WHERE id = NEW.id;
      
      -- Create new approval request
      INSERT INTO po_approval_requests (
        purchase_order_id, 
        requested_by, 
        status,
        approval_threshold,
        assigned_to
      )
      VALUES (
        NEW.id, 
        NEW.buyer_user_id, 
        'PENDING',
        CASE WHEN po_total >= 25000 THEN 25000.00 ELSE NULL END,
        CASE WHEN po_total >= 25000 THEN lee_admin_id ELSE NULL END
      );
      
      -- Log the submission
      INSERT INTO po_approval_history (purchase_order_id, action, admin_user_id, notes)
      VALUES (
        NEW.id, 
        'SUBMITTED', 
        NEW.buyer_user_id, 
        CASE 
          WHEN po_total >= 25000 THEN 'Purchase order submitted for approval (over $25,000 threshold) - Assigned to Lee McDuffie'
          ELSE 'Purchase order submitted for approval'
        END
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The trigger for create_po_approval_request is created in migration 033_create_po_approval_system.sql
-- We don't need to recreate it here as it will automatically use the updated function
