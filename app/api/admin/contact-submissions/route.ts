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
  unread_count: number;
}

// GET /api/admin/contact-submissions - List all contact submissions
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('contact.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let sql = `
    SELECT 
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
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status === 'spam') {
    sql += ` AND cs.is_spam = true`;
  } else if (status && status !== 'all') {
    sql += ` AND cs.status = $${paramIndex} AND cs.is_spam = false`;
    params.push(status);
    paramIndex++;
  } else {
    // Default: exclude spam from normal views
    sql += ` AND cs.is_spam = false`;
  }

  if (search) {
    sql += ` AND (cs.name ILIKE $${paramIndex} OR cs.email ILIKE $${paramIndex} OR cs.subject ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ' ORDER BY cs.created_at DESC';

  const submissions = await query<ContactSubmission>(sql, params);

  return NextResponse.json(
    submissions.map((s) => ({
      id: s.id,
      userId: s.user_id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      subject: s.subject,
      message: s.message,
      status: s.status,
      isSpam: s.is_spam,
      assignedAdminId: s.assigned_admin_id,
      assignedAdminName: s.assigned_admin_name,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      unreadCount: s.unread_count,
    }))
  );
}

// DELETE /api/admin/contact-submissions - Bulk delete submissions by ID array
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin('contact.delete');
  if (auth.error) return auth.error;

  const body = await request.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }

  // Validate all IDs are strings
  if (!ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'All ids must be strings' }, { status: 400 });
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  await query(
    `DELETE FROM contact_submissions WHERE id IN (${placeholders})`,
    ids
  );

  await logAction({
    adminUserId: auth.session.adminUser.id,
    action: 'delete',
    resourceType: 'content',
    resourceId: ids.join(','),
    before: { ids, type: 'contact_submission_bulk_delete' },
  });

  return NextResponse.json({ success: true, deleted: ids.length });
}

// POST /api/admin/contact-submissions - Add a reply message or internal note
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('contact.reply');
  if (auth.error) return auth.error;

  const body = await request.json();
  const { submissionId, message, isNote } = body;

  if (!submissionId || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify submission exists
  const submission = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM contact_submissions WHERE id = $1',
    [submissionId]
  );

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  if (isNote) {
    // Create internal note
    const note = await queryOne<{
      id: string;
      note: string;
      created_at: string;
    }>(
      `INSERT INTO contact_submission_notes (submission_id, admin_user_id, note)
       VALUES ($1, $2, $3)
       RETURNING id, note, created_at`,
      [submissionId, auth.session.adminUser.id, message]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'content',
      resourceId: submissionId,
      after: { type: 'contact_note' },
    });

    return NextResponse.json({
      success: true,
      note: {
        id: note?.id,
        note: note?.note,
        adminName: auth.session.user.name,
        createdAt: note?.created_at,
      },
    });
  } else {
    // Create reply message
    const newMessage = await queryOne<{
      id: string;
      message: string;
      created_at: string;
    }>(
      `INSERT INTO contact_submission_messages 
       (submission_id, message, created_by_admin_id, is_admin_reply, is_read_by_user, is_read_by_admin)
       VALUES ($1, $2, $3, true, false, true)
       RETURNING id, message, created_at`,
      [submissionId, message, auth.session.adminUser.id]
    );

    // Update status to in_progress if it was new
    if (submission.status === 'new') {
      await query(
        `UPDATE contact_submissions SET status = 'in_progress' WHERE id = $1`,
        [submissionId]
      );
    }

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'content',
      resourceId: submissionId,
      after: { type: 'contact_reply' },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: newMessage?.id,
        message: newMessage?.message,
        isAdminReply: true,
        adminName: auth.session.user.name,
        createdAt: newMessage?.created_at,
      },
    });
  }
}

