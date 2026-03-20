import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { hashAdminPassword } from '@/lib/admin-password';
import { logAction } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// PUT /api/admin/suppliers/[id]/password - Update supplier password
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.create');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  const { id } = await params;

  try {
    const { password } = await request.json();

    // Validate password
    if (!password || password.length < 8) {
      securityLogger.logValidationFailure(
        `/api/admin/suppliers/${id}/password`,
        ip,
        [{ message: 'Password must be at least 8 characters' }],
        'PUT'
      );
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if supplier exists
    const existingSupplier = await queryOne<{ 
      id: string; 
      email: string;
      name: string;
    }>(
      'SELECT id, email, name FROM supplier_users WHERE id = $1',
      [id]
    );

    if (!existingSupplier) {
      return NextResponse.json(
        { error: 'Supplier user not found' },
        { status: 404 }
      );
    }

    // Hash the new password
    const passwordHash = await hashAdminPassword(password);

    // Use transaction to ensure atomicity
    try {
      await query('BEGIN');

      // Update password and clear lockout
      await query(
        `UPDATE supplier_users
         SET password_hash = $1,
             failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, id]
      );

      // Invalidate all sessions for this supplier
      await query(
        'DELETE FROM supplier_sessions WHERE supplier_user_id = $1',
        [id]
      );

      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    // Log the action (don't log the actual password!)
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'supplier_user',
      resourceId: id,
      after: { password_changed: true },
    });

    // Security logging
    securityLogger.logEvent({
      type: 'admin_action',
      userId: auth.session.adminUser.id,
      username: auth.session.adminUser.email,
      ip,
      path: `/api/admin/suppliers/${id}/password`,
      method: 'PUT',
      details: { 
        action: 'supplier_password_reset',
        supplier_id: id,
        supplier_email: existingSupplier.email,
        supplier_name: existingSupplier.name
      },
      severity: 'high',
    });

    return NextResponse.json({ 
      success: true,
      message: 'Password updated successfully. Supplier has been logged out of all devices.'
    });
  } catch (error) {
    securityLogger.logError('Failed to update supplier password', error, ip);
    console.error('Error updating supplier password:', error);
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    );
  }
}
