import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  orders_count?: number;
  total_spent?: string;
  customer_number?: string | null;
}

// GET /api/admin/users - List all users
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('users.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  let sql = `
    SELECT 
      u.*,
      up.customer_number,
      COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END)::int as orders_count,
      COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) as total_spent
    FROM "user" u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'cancelled'
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    sql += ` WHERE (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR up.customer_number ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ' GROUP BY u.id, up.customer_number ORDER BY u."createdAt" DESC';

  const users = await query<User>(sql, params);
  return NextResponse.json(users);
}

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

// POST /api/admin/users - Create a customer account (admin-managed, pre-verified)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('users.update');
  if (auth.error) return auth.error;

  const body = await request.json();
  const result = createUserSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', details: result.error.issues }, { status: 400 });
  }

  const { name, email, password } = result.data;

  // Check for duplicate email
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1`,
    [email]
  );
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const now = new Date().toISOString();

  // Insert into Better Auth user table — mark email as pre-verified so no verification email needed
  const newUser = await queryOne<User>(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, $4, $4)
     RETURNING id, email, name, image, "emailVerified" as email_verified, "createdAt" as created_at`,
    [userId, name, email, now]
  );

  // Insert credential into account table (Better Auth credential provider)
  await query(
    `INSERT INTO account (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'credential', $4, $5, $5)`,
    [randomUUID(), userId, email, passwordHash, now]
  );

  return NextResponse.json(newUser, { status: 201 });
}

