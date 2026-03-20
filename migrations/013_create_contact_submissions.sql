-- Contact submissions table for storing contact form entries
CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  assigned_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact submission messages table for threaded conversations
CREATE TABLE IF NOT EXISTS contact_submission_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  submission_id TEXT NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  is_admin_reply BOOLEAN NOT NULL DEFAULT false,
  is_read_by_user BOOLEAN NOT NULL DEFAULT false,
  is_read_by_admin BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact submission notes table for internal admin notes
CREATE TABLE IF NOT EXISTS contact_submission_notes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  submission_id TEXT NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_submissions_user_id ON contact_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_assigned_admin_id ON contact_submissions(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON contact_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submission_messages_submission_id ON contact_submission_messages(submission_id);
CREATE INDEX IF NOT EXISTS idx_contact_submission_messages_is_read_by_user ON contact_submission_messages(is_read_by_user) WHERE is_admin_reply = true;
CREATE INDEX IF NOT EXISTS idx_contact_submission_messages_is_read_by_admin ON contact_submission_messages(is_read_by_admin) WHERE is_admin_reply = false;
CREATE INDEX IF NOT EXISTS idx_contact_submission_notes_submission_id ON contact_submission_notes(submission_id);

-- Comments for documentation
COMMENT ON TABLE contact_submissions IS 'Contact form submissions from customers';
COMMENT ON TABLE contact_submission_messages IS 'Threaded conversation messages between customers and admins';
COMMENT ON TABLE contact_submission_notes IS 'Internal admin notes on contact submissions (not visible to customers)';
COMMENT ON COLUMN contact_submissions.status IS 'Submission status: new, in_progress, or resolved';
COMMENT ON COLUMN contact_submissions.assigned_admin_id IS 'Admin user assigned to handle this submission';
COMMENT ON COLUMN contact_submission_messages.is_admin_reply IS 'True if message was sent by admin, false if by customer';
COMMENT ON COLUMN contact_submission_messages.is_read_by_user IS 'Whether the customer has read this message (for admin replies)';
COMMENT ON COLUMN contact_submission_messages.is_read_by_admin IS 'Whether admin has read this message (for customer messages)';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contact_submission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_contact_submissions_timestamp ON contact_submissions;
CREATE TRIGGER trigger_update_contact_submissions_timestamp
  BEFORE UPDATE ON contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_submission_updated_at();

-- Add contact permissions to existing admin roles
UPDATE admin_roles 
SET permissions = permissions || '["contact.view", "contact.update", "contact.reply", "contact.delete"]'::jsonb
WHERE id IN ('super-admin', 'admin');

UPDATE admin_roles 
SET permissions = permissions || '["contact.view", "contact.reply"]'::jsonb
WHERE id = 'support';

