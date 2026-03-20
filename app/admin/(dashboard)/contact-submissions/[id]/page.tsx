import { redirect, notFound } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { EditContactSubmission } from './edit-contact-submission';

interface ContactSubmission {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactMessage {
  id: string;
  message: string;
  is_admin_reply: boolean;
  admin_name: string | null;
  user_name: string | null;
  created_at: string;
}

interface ContactNote {
  id: string;
  note: string;
  admin_name: string;
  created_at: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

async function getSubmission(id: string): Promise<ContactSubmission | null> {
  return queryOne<ContactSubmission>(
    `SELECT cs.*, au.name as assigned_admin_name
     FROM contact_submissions cs
     LEFT JOIN admin_users au ON cs.assigned_admin_id = au.id
     WHERE cs.id = $1`,
    [id]
  );
}

async function getMessages(submissionId: string): Promise<ContactMessage[]> {
  return query<ContactMessage>(
    `SELECT csm.id, csm.message, csm.is_admin_reply, csm.created_at,
     au.name as admin_name,
     u.name as user_name
     FROM contact_submission_messages csm
     LEFT JOIN admin_users au ON csm.created_by_admin_id = au.id
     LEFT JOIN "user" u ON csm.created_by_user_id = u.id
     WHERE csm.submission_id = $1
     ORDER BY csm.created_at ASC`,
    [submissionId]
  );
}

async function getNotes(submissionId: string): Promise<ContactNote[]> {
  return query<ContactNote>(
    `SELECT csn.id, csn.note, csn.created_at, au.name as admin_name
     FROM contact_submission_notes csn
     JOIN admin_users au ON csn.admin_user_id = au.id
     WHERE csn.submission_id = $1
     ORDER BY csn.created_at DESC`,
    [submissionId]
  );
}

async function getAdminUsers(): Promise<AdminUser[]> {
  return query<AdminUser>(
    `SELECT au.id, 
     COALESCE(au.name, u.name) as name, 
     COALESCE(au.email, u.email) as email 
     FROM admin_users au
     LEFT JOIN "user" u ON u.id = au.user_id
     ORDER BY COALESCE(au.name, u.name) ASC`
  );
}

async function markMessagesAsRead(submissionId: string) {
  await query(
    `UPDATE contact_submission_messages 
     SET is_read_by_admin = true 
     WHERE submission_id = $1 AND is_admin_reply = false AND is_read_by_admin = false`,
    [submissionId]
  );
}

export default async function ContactSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();

  if (!session?.permissions.includes('contact.view')) {
    redirect('/admin');
  }

  const { id } = await params;
  const submission = await getSubmission(id);

  if (!submission) {
    notFound();
  }

  // Mark messages as read
  await markMessagesAsRead(id);

  const [messages, notes, admins] = await Promise.all([
    getMessages(id),
    getNotes(id),
    getAdminUsers(),
  ]);

  return (
    <div>
      <EditContactSubmission
        submission={submission}
        messages={messages}
        notes={notes}
        admins={admins}
        permissions={session.permissions}
        currentAdminId={session.adminUser.id}
        currentAdminName={session.user.name}
      />
    </div>
  );
}

