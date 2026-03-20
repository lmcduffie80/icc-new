-- Schema migrations tracking table
-- This table records which migrations have been executed to prevent re-running them

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by filename
CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename);

COMMENT ON TABLE schema_migrations IS 'Tracks executed database migrations to prevent duplicate runs';
COMMENT ON COLUMN schema_migrations.filename IS 'Name of the migration file';
COMMENT ON COLUMN schema_migrations.checksum IS 'MD5 hash of the migration file contents for change detection';
COMMENT ON COLUMN schema_migrations.executed_at IS 'Timestamp when the migration was executed';

