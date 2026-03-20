-- Migration: Add Report Permissions
-- Description: Add granular report permissions to existing admin roles
-- This migration adds new report permissions to support fine-grained access control
-- for financial reports (Overview, P&L, Balance Sheet, Customer Reports)

-- Add new report permissions to existing Super Admin role
UPDATE admin_roles
SET permissions = permissions || 
  '["reports.view_overview", "reports.view_profit_loss", "reports.view_balance_sheet", "reports.view_customers"]'::jsonb
WHERE id = 'super-admin'
  AND NOT permissions ? 'reports.view_overview';

-- Add new report permissions to existing Admin role  
UPDATE admin_roles
SET permissions = permissions || 
  '["reports.view_overview", "reports.view_profit_loss", "reports.view_balance_sheet", "reports.view_customers"]'::jsonb
WHERE id = 'admin'
  AND NOT permissions ? 'reports.view_overview';

-- Optionally add overview permission to support role
-- (Support staff can see basic financial overview but not detailed statements)
UPDATE admin_roles
SET permissions = permissions || 
  '["reports.view_overview"]'::jsonb
WHERE id = 'support'
  AND NOT permissions ? 'reports.view_overview';
