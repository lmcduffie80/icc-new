-- Migration 059: Add contracts.delete permission to super-admin and admin roles
UPDATE admin_roles
SET permissions = permissions || '["contracts.delete"]'::jsonb
WHERE name IN ('super-admin', 'admin')
  AND NOT (permissions @> '["contracts.delete"]'::jsonb);
