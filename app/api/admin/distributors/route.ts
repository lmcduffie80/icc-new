import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface DistributorUser {
  user_id: string;
  name: string | null;
  email: string;
  customer_number: string | null;
  is_distributor: boolean;
  distributor_notes: string | null;
  distributor_approved_at: string | null;
  distributor_approved_by: string | null;
  created_at: string;
}

// GET /api/admin/distributors — list all users; distributors sorted to top
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('distributors.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const onlyDistributors = searchParams.get('only_distributors') === '1';

  const params: unknown[] = [];
  let where = 'WHERE 1=1';
  let idx = 1;

  if (search) {
    where += ` AND (u.email ILIKE $${idx} OR u.name ILIKE $${idx} OR up.customer_number ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  if (onlyDistributors) {
    where += ` AND up.is_distributor = true`;
  }

  const users = await query<DistributorUser>(
    `SELECT
       u.id AS user_id,
       u.name,
       u.email,
       up.customer_number,
       COALESCE(up.is_distributor, false) AS is_distributor,
       up.distributor_notes,
       up.distributor_approved_at,
       up.distributor_approved_by,
       u."createdAt" AS created_at
     FROM "user" u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     ${where}
     ORDER BY up.is_distributor DESC NULLS LAST, u.name ASC
     LIMIT 500`,
    params
  );

  return NextResponse.json(users);
}
