import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';

// POST /api/admin/auth/logout - Admin logout
export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('admin_session')?.value;

    if (sessionToken) {
      // Delete the session from database
      await query('DELETE FROM admin_sessions WHERE token = $1', [sessionToken]);
      
      // Clear the cookie
      cookieStore.delete('admin_session');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin logout error:', error);
    return NextResponse.json(
      { error: 'An error occurred during logout' },
      { status: 500 }
    );
  }
}

