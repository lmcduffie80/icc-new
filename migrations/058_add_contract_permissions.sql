-- Migration: Add Contract Permissions to Admin Roles
-- Description: Add contracts.view, contracts.sign, and contracts.manage_template
-- permissions to support the Supply Agreement management feature

-- Add all contract permissions to Super Admin role
UPDATE admin_roles
SET permissions = permissions || '["contracts.view","contracts.sign","contracts.manage_template"]'::jsonb
WHERE id = 'super-admin'
  AND NOT permissions ? 'contracts.view';

-- Add view and sign permissions to Admin role
UPDATE admin_roles
SET permissions = permissions || '["contracts.view","contracts.sign"]'::jsonb
WHERE id = 'admin'
  AND NOT permissions ? 'contracts.view';

-- Note: Support role intentionally does NOT get contract permissions by default
-- as contracts contain sensitive business data. Can be added manually if needed.
