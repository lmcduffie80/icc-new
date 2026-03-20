import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

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
}

interface ContactMessage {
  id: string;
  submission_id: string;
  message: string;
  created_by_user_id: string | null;
  created_by_admin_id: string | null;
  is_admin_reply: boolean;
  is_read_by_admin: boolean;
  created_at: string;
  admin_name: string | null;
  user_name: string | null;
}

interface ContactNote {
  id: string;
  submission_id: string;
  note: string;
  admin_user_id: string;
  admin_name: string;
  created_at: string;
}

// GET /api/admin/contact-submissions/[id] - Get submission details with messages and notes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('contact.view');
  if (auth.error) return auth.error;

  const { id } = await params;

  // Get submission with assigned admin name
  const submission = await queryOne<ContactSubmission>(
    `SELECT cs.*, au.name as assigned_admin_name
     FROM contact_submissions cs
     LEFT JOIN admin_users au ON cs.assigned_admin_id = au.id
     WHERE cs.id = $1`,
    [id]
  );

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  // Get messages with user/admin names
  const messages = await query<ContactMessage>(
    `SELECT csm.*, 
     au.name as admin_name,
     u.name as user_name
     FROM contact_submission_messages csm
     LEFT JOIN admin_users au ON csm.created_by_admin_id = au.id
     LEFT JOIN "user" u ON csm.created_by_user_id = u.id
     WHERE csm.submission_id = $1
     ORDER BY csm.created_at ASC`,
    [id]
  );

  // Get internal notes
  const notes = await query<ContactNote>(
    `SELECT csn.*, au.name as admin_name
     FROM contact_submission_notes csn
     JOIN admin_users au ON csn.admin_user_id = au.id
     WHERE csn.submission_id = $1
     ORDER BY csn.created_at DESC`,
    [id]
  );

  // Mark customer messages as read by admin
  await query(
    `UPDATE contact_submission_messages 
     SET is_read_by_admin = true 
     WHERE submission_id = $1 AND is_admin_reply = false AND is_read_by_admin = false`,
    [id]
  );

  return NextResponse.json({
    submission: {
      id: submission.id,
      userId: submission.user_id,
      name: submission.name,
      email: submission.email,
      phone: submission.phone,
      subject: submission.subject,
      message: submission.message,
      status: submission.status,
      isSpam: submission.is_spam,
      assignedAdminId: submission.assigned_admin_id,
      assignedAdminName: submission.assigned_admin_name,
      createdAt: submission.created_at,
      updatedAt: submission.updated_at,
    },
    messages: messages.map((m) => ({
      id: m.id,
      message: m.message,
      isAdminReply: m.is_admin_reply,
      adminName: m.admin_name,
      userName: m.user_name,
      createdAt: m.created_at,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      note: n.note,
      adminName: n.admin_name,
      createdAt: n.created_at,
    })),
  });
}

// PATCH /api/admin/contact-submissions/[id] - Update submission status or assignment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('contact.update');
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const { status, assignedAdminId, isSpam } = body;

  // Get current submission
  const currentSubmission = await queryOne<ContactSubmission>(
    'SELECT * FROM contact_submissions WHERE id = $1',
    [id]
  );

  if (!currentSubmission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  const updates: string[] = [];
  const updateParams: unknown[] = [];
  let paramIndex = 1;

  if (status !== undefined) {
    if (!['new', 'in_progress', 'resolved'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.push(`status = $${paramIndex}`);
    updateParams.push(status);
    paramIndex++;
  }

  if (isSpam !== undefined) {
    updates.push(`is_spam = $${paramIndex}`);
    updateParams.push(Boolean(isSpam));
    paramIndex++;
  }

  if (assignedAdminId !== undefined) {
    // Verify admin exists if not null
    if (assignedAdminId !== null) {
      const admin = await queryOne<{ id: string }>(
        'SELECT id FROM admin_users WHERE id = $1',
        [assignedAdminId]
      );
      if (!admin) {
        return NextResponse.json({ error: 'Invalid admin user' }, { status: 400 });
      }
    }
    updates.push(`assigned_admin_id = $${paramIndex}`);
    updateParams.push(assignedAdminId);
    paramIndex++;
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  updateParams.push(id);
  const updated = await queryOne<ContactSubmission>(
    `UPDATE contact_submissions 
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    updateParams
  );

  await logAction({
    adminUserId: auth.session.adminUser.id,
    action: 'update',
    resourceType: 'content',
    resourceId: id,
    before: {
      status: currentSubmission.status,
      assignedAdminId: currentSubmission.assigned_admin_id,
      isSpam: currentSubmission.is_spam,
      type: 'contact_submission',
    },
    after: {
      status: updated?.status,
      assignedAdminId: updated?.assigned_admin_id,
      isSpam: updated?.is_spam,
      type: 'contact_submission',
    },
  });

  return NextResponse.json({
    success: true,
    submission: {
      id: updated?.id,
      status: updated?.status,
      isSpam: updated?.is_spam,
      assignedAdminId: updated?.assigned_admin_id,
    },
  });
}

// DELETE /api/admin/contact-submissions/[id] - Delete a submission
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('contact.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  // Get submission for audit log
  const submission = await queryOne<ContactSubmission>(
    'SELECT * FROM contact_submissions WHERE id = $1',
    [id]
  );

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  // Delete submission (cascade will handle messages and notes)
  await query('DELETE FROM contact_submissions WHERE id = $1', [id]);

  await logAction({
    adminUserId: auth.session.adminUser.id,
    action: 'delete',
    resourceType: 'content',
    resourceId: id,
    before: {
      name: submission.name,
      email: submission.email,
      subject: submission.subject,
      type: 'contact_submission',
    },
  });

  return NextResponse.json({ success: true });
}

