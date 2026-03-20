import { NextRequest, NextResponse } from 'next/server';
import { 
  requireAdmin, 
  updateAdminUserRole, 
  updateAdminUserPermissions, 
  deleteAdminUser,
  getAdminRole
} from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { Permission, isValidPermission } from '@/lib/permissions';

interface AdminUser {
  id: string;
  user_id: null; // Always null - admins are standalone only, never linked to customer accounts
  role_id: string;
  custom_permissions: { grant: Permission[]; revoke: Permission[] };
  email: string; // Required for all admins
  name: string; // Required for all admins
  created_at: string;
  updated_at: string;
}

// GET /api/admin/admins/[id] - Get single admin user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.view');
  if (auth.error) return auth.error;

  const { id } = await params;

  const adminUser = await queryOne<AdminUser & { user_email: string; user_name: string; role_name: string; role_permissions: Permission[] }>(
    `SELECT 
      au.*,
      COALESCE(au.email, u.email) as user_email,
      COALESCE(au.name, u.name) as user_name,
      ar.name as role_name,
      ar.permissions as role_permissions
    FROM admin_users au
    LEFT JOIN "user" u ON u.id = au.user_id
    JOIN admin_roles ar ON ar.id = au.role_id
    WHERE au.id = $1`,
    [id]
  );

  if (!adminUser) {
    return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
  }

  return NextResponse.json(adminUser);
}

// PUT /api/admin/admins/[id] - Update admin user role
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.update');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { roleId } = body;

    if (!roleId) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }

    // Get existing admin for audit
    const existingAdmin = await queryOne<AdminUser & { role_name: string }>(
      `SELECT au.*, ar.name as role_name
       FROM admin_users au
       JOIN admin_roles ar ON ar.id = au.role_id
       WHERE au.id = $1`,
      [id]
    );

    if (!existingAdmin) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
    }

    // Prevent changing super admin role unless you are one
    if (
      (existingAdmin.role_id === 'super-admin' || roleId === 'super-admin') &&
      auth.session.role.id !== 'super-admin'
    ) {
      return NextResponse.json(
        { error: 'Only Super Admins can modify Super Admin roles' },
        { status: 403 }
      );
    }

    // Check if role exists
    const newRole = await getAdminRole(roleId);
    if (!newRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const updatedAdmin = await updateAdminUserRole(id, roleId);

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'role_change',
      resourceType: 'admin_user',
      resourceId: id,
      before: { role_id: existingAdmin.role_id, role_name: existingAdmin.role_name },
      after: { role_id: roleId, role_name: newRole.name },
    });

    return NextResponse.json(updatedAdmin);
  } catch (error) {
    console.error('Error updating admin role:', error);
    return NextResponse.json({ error: 'Failed to update admin role' }, { status: 500 });
  }
}

// PATCH /api/admin/admins/[id] - Update custom permissions
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.manage_permissions');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { customPermissions } = body;

    if (!customPermissions || typeof customPermissions !== 'object') {
      return NextResponse.json(
        { error: 'Custom permissions object is required' },
        { status: 400 }
      );
    }

    // Validate permissions
    const { grant = [], revoke = [] } = customPermissions;
    
    for (const perm of [...grant, ...revoke]) {
      if (!isValidPermission(perm)) {
        return NextResponse.json(
          { error: `Invalid permission: ${perm}` },
          { status: 400 }
        );
      }
    }

    // Get existing admin for audit
    const existingAdmin = await queryOne<AdminUser>(
      'SELECT * FROM admin_users WHERE id = $1',
      [id]
    );

    if (!existingAdmin) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
    }

    // Prevent modifying super admin permissions unless you are one
    if (existingAdmin.role_id === 'super-admin' && auth.session.role.id !== 'super-admin') {
      return NextResponse.json(
        { error: 'Only Super Admins can modify Super Admin permissions' },
        { status: 403 }
      );
    }

    const updatedAdmin = await updateAdminUserPermissions(id, { grant, revoke });

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'permission_change',
      resourceType: 'admin_user',
      resourceId: id,
      before: { custom_permissions: existingAdmin.custom_permissions },
      after: { custom_permissions: { grant, revoke } },
    });

    return NextResponse.json(updatedAdmin);
  } catch (error) {
    console.error('Error updating permissions:', error);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}

// DELETE /api/admin/admins/[id] - Delete admin user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    // Get existing admin for audit
    const existingAdmin = await queryOne<AdminUser & { user_email: string; role_name: string }>(
      `SELECT au.*, COALESCE(au.email, u.email) as user_email, ar.name as role_name
       FROM admin_users au
       LEFT JOIN "user" u ON u.id = au.user_id
       JOIN admin_roles ar ON ar.id = au.role_id
       WHERE au.id = $1`,
      [id]
    );

    if (!existingAdmin) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
    }

    // Prevent deleting super admins unless you are one
    if (existingAdmin.role_id === 'super-admin' && auth.session.role.id !== 'super-admin') {
      return NextResponse.json(
        { error: 'Only Super Admins can delete other Super Admins' },
        { status: 403 }
      );
    }

    // Prevent self-deletion
    if (existingAdmin.id === auth.session.adminUser.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own admin account' },
        { status: 400 }
      );
    }

    await deleteAdminUser(id);

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'admin_user',
      resourceId: id,
      before: { user_email: existingAdmin.user_email, role_name: existingAdmin.role_name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting admin:', error);
    return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 });
  }
}

