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
  unread_count: number;
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
}

// GET: Fetch all contact submissions for authenticated user
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get submissions with unread count
    const submissions = await query<ContactSubmission>(
      `SELECT cs.*, 
        COALESCE((
          SELECT COUNT(*) 
          FROM contact_submission_messages csm 
          WHERE csm.submission_id = cs.id 
          AND csm.is_admin_reply = true 
          AND csm.is_read_by_user = false
        ), 0)::int as unread_count
       FROM contact_submissions cs
       WHERE cs.user_id = $1
       ORDER BY cs.created_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({
      submissions: submissions.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        subject: s.subject,
        message: s.message,
        status: s.status,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        unreadCount: s.unread_count,
      })),
    });
  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}

// POST: Add a follow-up message to a submission
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { submissionId, message } = body;

    if (!submissionId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the submission belongs to this user
    const submission = await queryOne<ContactSubmission>(
      `SELECT * FROM contact_submissions WHERE id = $1 AND user_id = $2`,
      [submissionId, session.user.id]
    );

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Create the message
    const newMessage = await queryOne<ContactSubmissionMessage>(
      `INSERT INTO contact_submission_messages 
       (submission_id, message, created_by_user_id, is_admin_reply, is_read_by_user, is_read_by_admin)
       VALUES ($1, $2, $3, false, true, false)
       RETURNING *`,
      [submissionId, message, session.user.id]
    );

    // Update the submission status to 'new' if it was resolved (new activity)
    if (submission.status === 'resolved') {
      await query(
        `UPDATE contact_submissions SET status = 'new' WHERE id = $1`,
        [submissionId]
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: newMessage?.id,
        message: newMessage?.message,
        isAdminReply: false,
        createdAt: newMessage?.created_at,
      },
    });
  } catch (error) {
    console.error('Error adding follow-up message:', error);
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
  }
}

