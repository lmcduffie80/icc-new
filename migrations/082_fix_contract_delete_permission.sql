-- Migration 082: Fix contracts.delete permission grant
--
-- Migration 059 attempted to grant contracts.delete to admins but used
-- `WHERE name IN ('super-admin', 'admin')`. The admin_roles table stores
-- 'super-admin' / 'admin' in the `id` column; the `name` column holds the
-- display labels 'Super Admin' / 'Admin'. As a result, migration 059 matched
-- zero rows and the permission was never granted, causing admins to receive
-- "Forbidden" when attempting to delete contracts.
--
-- This migration grants the permission using the correct column.

UPDATE admin_roles
SET permissions = permissions || '["contracts.delete"]'::jsonb
WHERE id IN ('super-admin', 'admin')
  AND NOT (permissions @> '["contracts.delete"]'::jsonb);
