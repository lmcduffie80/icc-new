-- Migration: Add Transaction Report Permission
-- Description: Add reports.view_transactions permission for the new Material Transactions (MB51) report
-- This permission allows viewing inventory transaction history across all movements

-- Add new transaction report permission to existing Super Admin role
UPDATE admin_roles
SET permissions = permissions || 
  '["reports.view_transactions"]'::jsonb
WHERE id = 'super-admin'
  AND NOT permissions ? 'reports.view_transactions';

-- Add new transaction report permission to existing Admin role  
UPDATE admin_roles
SET permissions = permissions || 
  '["reports.view_transactions"]'::jsonb
WHERE id = 'admin'
  AND NOT permissions ? 'reports.view_transactions';

-- Note: Support role intentionally does NOT get this permission by default
-- as it contains sensitive inventory movement data. Can be added manually if needed.
