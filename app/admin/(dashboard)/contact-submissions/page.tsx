import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import { ContactSubmissionsTable } from './contact-submissions-table';

export const metadata = {
  title: 'Contact Submissions - Admin Dashboard',
  description: 'Manage contact form submissions',
};

interface ContactSubmission {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  is_spam: boolean;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
  unread_count: number;
}

async function getContactSubmissions(): Promise<ContactSubmission[]> {
  return query<ContactSubmission>(
    `SELECT 
      cs.*,
      au.name as assigned_admin_name,
      COALESCE((
        SELECT COUNT(*) 
        FROM contact_submission_messages csm 
        WHERE csm.submission_id = cs.id 
        AND csm.is_admin_reply = false 
        AND csm.is_read_by_admin = false
      ), 0)::int as unread_count
    FROM contact_submissions cs
    LEFT JOIN admin_users au ON cs.assigned_admin_id = au.id
    ORDER BY cs.created_at DESC`
  );
}

export default async function ContactSubmissionsPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('contact.view')) {
    redirect('/admin');
  }

  const submissions = await getContactSubmissions();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Contact Submissions</h1>
        <p className="mt-1 text-slate-500">Manage customer contact form submissions</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-gray-500">Total</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {submissions.filter((s) => !s.is_spam).length}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-gray-500">New</div>
          <div className="mt-1 text-2xl font-semibold text-primary">
            {submissions.filter((s) => !s.is_spam && s.status === 'new').length}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-gray-500">In Progress</div>
          <div className="mt-1 text-2xl font-semibold text-yellow-600">
            {submissions.filter((s) => !s.is_spam && s.status === 'in_progress').length}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-gray-500">Resolved</div>
          <div className="mt-1 text-2xl font-semibold text-primary">
            {submissions.filter((s) => !s.is_spam && s.status === 'resolved').length}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow border border-red-100">
          <div className="text-sm font-medium text-red-500">Spam</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">
            {submissions.filter((s) => s.is_spam).length}
          </div>
        </div>
      </div>

      <ContactSubmissionsTable submissions={submissions} permissions={session.permissions} />
    </div>
  );
}

