import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { hashAdminPassword } from '@/lib/admin-password';
import { logAction } from '@/lib/audit';

// PUT /api/admin/admins/[id]/password - Update admin password
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.manage_permissions');
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const { password } = await request.json();

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if admin user exists
    const existingAdmin = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM admin_users WHERE id = $1',
      [id]
    );

    if (!existingAdmin) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      );
    }

    // Hash the new password
    const passwordHash = await hashAdminPassword(password);

    // Update the password
    await queryOne(
      `UPDATE admin_users 
       SET password_hash = $1, password_set_at = NOW(), updated_at = NOW(),
           failed_login_attempts = 0, locked_until = NULL
       WHERE id = $2`,
      [passwordHash, id]
    );

    // Log the action (don't log the actual password!)
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'admin_user',
      resourceId: id,
      after: { password_changed: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating admin password:', error);
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    );
  }
}

