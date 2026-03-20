import { getAdminSession, getAdminRoles } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import { EditAdminForm } from './edit-admin-form';

interface AdminUser {
  id: string;
  user_id: string | null;
  role_id: string;
  custom_permissions: { grant: Permission[]; revoke: Permission[] };
  // Standalone admin fields
  email: string | null;
  name: string | null;
  created_at: string;
  updated_at: string;
  password_set_at: string | null;
  // Joined user fields (null for standalone admins)
  user_email: string | null;
  user_name: string | null;
  role_name: string;
  role_permissions: Permission[];
}

async function getAdminUser(id: string): Promise<AdminUser | null> {
  return queryOne<AdminUser>(
    `SELECT 
      au.id,
      au.user_id,
      au.role_id,
      au.custom_permissions,
      au.email,
      au.name,
      au.created_at,
      au.updated_at,
      au.password_set_at,
      u.email as user_email,
      u.name as user_name,
      ar.name as role_name,
      ar.permissions as role_permissions
    FROM admin_users au
    LEFT JOIN "user" u ON u.id = au.user_id
    JOIN admin_roles ar ON ar.id = au.role_id
    WHERE au.id = $1`,
    [id]
  );
}

export default async function EditAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.update') && 
      !session?.permissions.includes('admins.manage_permissions')) {
    redirect('/admin/admins');
  }

  const { id } = await params;
  const [adminUser, roles] = await Promise.all([
    getAdminUser(id),
    getAdminRoles(),
  ]);

  if (!adminUser) {
    notFound();
  }

  // Filter out super-admin role if current user is not a super admin
  const filteredRoles = session.role.id === 'super-admin'
    ? roles
    : roles.filter((r) => r.id !== 'super-admin');

  const canUpdateRole = session.permissions.includes('admins.update');
  const canManagePermissions = session.permissions.includes('admins.manage_permissions');

  // Get display name - prefer linked user, fallback to standalone admin fields
  const displayName = adminUser.user_name || adminUser.name || adminUser.user_email || adminUser.email || 'Admin';

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Edit Admin</h1>
        <p className="mt-1 text-slate-500">
          Manage role and permissions for {displayName}
        </p>
      </div>

      <EditAdminForm
        adminUser={adminUser}
        roles={filteredRoles}
        canUpdateRole={canUpdateRole}
        canManagePermissions={canManagePermissions}
      />
    </div>
  );
}
