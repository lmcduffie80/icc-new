-- Fix product_approval_history action CHECK constraint
-- The original constraint (migration 029) only allowed 7 actions.
-- The codebase now uses 10 distinct action values.

-- Drop the old constraint
ALTER TABLE product_approval_history
  DROP CONSTRAINT IF EXISTS product_approval_history_action_check;

-- Add updated constraint with all action values used in code
ALTER TABLE product_approval_history
  ADD CONSTRAINT product_approval_history_action_check
  CHECK (action IN (
    'submitted',
    'admin_approved',
    'label_modified',
    'supplier_approved_label',
    'supplier_rejected_label',
    'published',
    'rejected',
    'assigned_to_supplier',
    'admin_assigned_supplier',
    'supplier_submitted'
  ));
