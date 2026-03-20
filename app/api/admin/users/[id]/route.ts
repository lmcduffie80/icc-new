import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/admin/users/[id] - Get a single user with profile and orders
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('users.view');
  if (auth.error) return auth.error;

  const { id } = await params;

  const user = await queryOne<User>('SELECT * FROM "user" WHERE id = $1', [id]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get profile if exists
  const profile = await queryOne<UserProfile>(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [id]
  );

  // Get order stats
  const orderStats = await queryOne<{ count: string; total: string }>(
    `SELECT COUNT(*)::int as count, COALESCE(SUM(total), 0) as total
     FROM orders WHERE user_id = $1 AND status != 'cancelled'`,
    [id]
  );

  // Get recent orders if permission allows
  let orders: object[] = [];
  if (auth.session.permissions.includes('users.view_orders')) {
    orders = await query(
      `SELECT id, order_number, status, total, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );
  }

  return NextResponse.json({
    ...user,
    profile,
    orders_count: parseInt(orderStats?.count || '0', 10),
    total_spent: orderStats?.total || '0',
    recent_orders: orders,
  });
}

// PUT /api/admin/users/[id] - Update user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('users.update');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, email } = body;

    const existingUser = await queryOne<User>('SELECT * FROM "user" WHERE id = $1', [id]);

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = await queryOne<User>(
      `UPDATE "user" 
       SET name = COALESCE($2, name), 
           email = COALESCE($3, email),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, email]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'user',
      resourceId: id,
      before: { name: existingUser.name, email: existingUser.email },
      after: { name: user!.name, email: user!.email },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - Delete user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('users.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const user = await queryOne<User>('SELECT * FROM "user" WHERE id = $1', [id]);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is an admin
    const isAdmin = await queryOne('SELECT id FROM admin_users WHERE user_id = $1', [id]);
    if (isAdmin) {
      return NextResponse.json(
        { error: 'Cannot delete admin users. Remove admin privileges first.' },
        { status: 400 }
      );
    }

    await queryOne('DELETE FROM "user" WHERE id = $1 RETURNING id', [id]);

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'user',
      resourceId: id,
      before: { email: user.email, name: user.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

