-- Migration: Remove membership and appointments feature
-- This migration drops all tables, triggers, and functions related to memberships and appointments

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_membership_timestamp ON user_memberships;
DROP TRIGGER IF EXISTS trigger_update_appointment_types_timestamp ON appointment_types;
DROP TRIGGER IF EXISTS trigger_update_member_appointments_timestamp ON member_appointments;

-- Drop functions
DROP FUNCTION IF EXISTS update_membership_updated_at();
DROP FUNCTION IF EXISTS update_appointment_updated_at();

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS member_appointments;
DROP TABLE IF EXISTS appointment_types;
DROP TABLE IF EXISTS user_memberships;

-- Remove appointments permissions from admin roles
UPDATE admin_roles
SET permissions = (
  SELECT jsonb_agg(p)
  FROM jsonb_array_elements(permissions::jsonb) AS p
  WHERE p::text NOT LIKE '%appointments%'
)::json
WHERE permissions::text LIKE '%appointments%';
