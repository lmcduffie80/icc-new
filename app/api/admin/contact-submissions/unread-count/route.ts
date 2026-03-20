import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';

// GET: Fetch unread customer messages count for admin
export async function GET() {
  const auth = await requireAdmin('contact.view');
  if (auth.error) return auth.error;

  const result = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM contact_submission_messages csm
     WHERE csm.is_admin_reply = false 
     AND csm.is_read_by_admin = false`
  );

  return NextResponse.json({
    unreadCount: result?.count || 0,
  });
}

