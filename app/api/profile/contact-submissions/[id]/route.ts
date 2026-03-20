import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';

interface ContactSubmission {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactSubmissionMessage {
  id: string;
  submission_id: string;
  message: string;
  created_by_user_id: string | null;
  created_by_admin_id: string | null;
  is_admin_reply: boolean;
  is_read_by_user: boolean;
  created_at: string;
  admin_name: string | null;
}

// GET: Fetch a single contact submission with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get submission
    const submission = await queryOne<ContactSubmission>(
      `SELECT * FROM contact_submissions WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Get messages with admin names
    const messages = await query<ContactSubmissionMessage>(
      `SELECT csm.*, au.name as admin_name
       FROM contact_submission_messages csm
       LEFT JOIN admin_users au ON csm.created_by_admin_id = au.id
       WHERE csm.submission_id = $1
       ORDER BY csm.created_at ASC`,
      [id]
    );

    // Mark admin replies as read by user
    await query(
      `UPDATE contact_submission_messages 
       SET is_read_by_user = true 
       WHERE submission_id = $1 AND is_admin_reply = true AND is_read_by_user = false`,
      [id]
    );

    return NextResponse.json({
      submission: {
        id: submission.id,
        name: submission.name,
        email: submission.email,
        phone: submission.phone,
        subject: submission.subject,
        message: submission.message,
        status: submission.status,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
      },
      messages: messages.map((m) => ({
        id: m.id,
        message: m.message,
        isAdminReply: m.is_admin_reply,
        adminName: m.admin_name,
        createdAt: m.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json({ error: 'Failed to fetch submission' }, { status: 500 });
  }
}

// PATCH: Update submission status (mark as resolved)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { status } = body;

    // Users can only mark their submissions as resolved
    if (status !== 'resolved') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Update submission
    const updated = await queryOne<ContactSubmission>(
      `UPDATE contact_submissions 
       SET status = $1 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [status, id, session.user.id]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      submission: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('Error updating submission:', error);
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 });
  }
}

// DELETE: Delete a submission
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete submission (cascade will delete messages)
    const deleted = await queryOne<{ id: string }>(
      `DELETE FROM contact_submissions WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, session.user.id]
    );

    if (!deleted) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting submission:', error);
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 });
  }
}

