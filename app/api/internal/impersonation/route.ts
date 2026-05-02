import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

interface ImpersonationRow {
  admin_user_id: string;
  admin_name: string;
  admin_email: string;
  target_user_id: string;
  target_user_name: string;
  target_user_email: string;
}

/**
 * Internal-only route used by middleware to validate an impersonation token.
 * Protected by a shared secret so it cannot be called by external clients.
 * The middleware cannot call lib/db directly (Edge runtime), so it fetches here.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = request.headers.get('x-impersonation-token');
  if (!token) {
    return NextResponse.json(null, { status: 400 });
  }

  try {
    const row = await queryOne<ImpersonationRow>(
      `SELECT
         s.admin_user_id, s.target_user_id,
         a.name AS admin_name, a.email AS admin_email,
         u.name AS target_user_name, u.email AS target_user_email
       FROM admin_impersonation_sessions s
       JOIN admin_users a ON a.id = s.admin_user_id
       JOIN "user" u ON u.id = s.target_user_id
       WHERE s.token = $1
         AND s.ended_at IS NULL
         AND s.expires_at > NOW()`,
      [token]
    );

    if (!row) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
