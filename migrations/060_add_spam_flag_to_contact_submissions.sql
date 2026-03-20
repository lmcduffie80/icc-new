-- Migration 060: Add is_spam flag to contact_submissions
-- Allows admins to mark bot/spam submissions for filtering

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS is_spam BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_is_spam
  ON contact_submissions (is_spam);
