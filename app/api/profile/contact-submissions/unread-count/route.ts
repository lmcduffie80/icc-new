import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';

// GET: Fetch unread admin replies count for authenticated user
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count
       FROM contact_submission_messages csm
       JOIN contact_submissions cs ON csm.submission_id = cs.id
       WHERE cs.user_id = $1 
       AND csm.is_admin_reply = true 
       AND csm.is_read_by_user = false`,
      [session.user.id]
    );

    return NextResponse.json({
      unreadCount: result?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 });
  }
}

