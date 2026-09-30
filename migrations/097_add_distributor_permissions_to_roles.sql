-- Migration 097: Add distributor permissions to existing admin roles
-- The distributor feature was added after the initial role seed, so
-- distributors.view and distributors.manage must be backfilled.
--
-- Rules:
--   super-admin → gets both distributors.view AND distributors.manage
--   admin       → gets both distributors.view AND distributors.manage
--   support     → no distributor access (read-only support role)

UPDATE admin_roles
SET permissions = (
  SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
  FROM (
    SELECT jsonb_array_elements_text(permissions) AS elem
    UNION ALL
    SELECT unnest(ARRAY['distributors.view', 'distributors.manage'])
  ) sub
)
WHERE id IN ('super-admin', 'admin')
  AND is_system = true;

-- Verify (informational)
-- SELECT id, name, permissions FROM admin_roles WHERE id IN ('super-admin', 'admin');
