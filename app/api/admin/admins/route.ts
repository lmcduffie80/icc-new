import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUsers, createStandaloneAdminUser, adminEmailExists } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { Permission, isValidPermission } from '@/lib/permissions';

// GET /api/admin/admins - List all admin users
export async function GET() {
  const auth = await requireAdmin('admins.view');
  if (auth.error) return auth.error;

  const admins = await getAdminUsers();
  return NextResponse.json(admins);
}

// POST /api/admin/admins - Create a new standalone admin user with email/password
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('admins.create');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { email, name, password, roleId, customPermissions } = body;

    // Validate required fields
    if (!email || !name || !password || !roleId) {
      return NextResponse.json(
        { error: 'Email, name, password, and role are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if email already exists
    if (await adminEmailExists(email)) {
      return NextResponse.json(
        { error: 'An admin with this email already exists' },
        { status: 400 }
      );
    }

    // Check if role exists
    const role = await queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM admin_roles WHERE id = $1',
      [roleId]
    );

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Prevent creating super admins unless you are one
    if (roleId === 'super-admin' && auth.session.role.id !== 'super-admin') {
      return NextResponse.json(
        { error: 'Only Super Admins can create other Super Admins' },
        { status: 403 }
      );
    }

    // Validate custom permissions if provided
    let validatedCustomPermissions = { grant: [] as Permission[], revoke: [] as Permission[] };
    if (customPermissions) {
      const { grant = [], revoke = [] } = customPermissions;
      
      // Validate grant permissions
      for (const perm of grant) {
        if (!isValidPermission(perm)) {
          return NextResponse.json(
            { error: `Invalid permission: ${perm}` },
            { status: 400 }
          );
        }
      }
      
      // Validate revoke permissions
      for (const perm of revoke) {
        if (!isValidPermission(perm)) {
          return NextResponse.json(
            { error: `Invalid permission: ${perm}` },
            { status: 400 }
          );
        }
      }
      
      validatedCustomPermissions = {
        grant: grant.filter(isValidPermission),
        revoke: revoke.filter(isValidPermission),
      };
    }

    // Create the standalone admin user
    const adminUser = await createStandaloneAdminUser(
      email,
      name,
      password,
      roleId,
      validatedCustomPermissions
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'admin_user',
      resourceId: adminUser.id,
      after: {
        email,
        name,
        role_id: roleId,
        role_name: role.name,
        custom_permissions: validatedCustomPermissions,
        is_standalone: true,
      },
    });

    return NextResponse.json(adminUser, { status: 201 });
  } catch (error) {
    console.error('Error creating admin user:', error);
    return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 });
  }
}
