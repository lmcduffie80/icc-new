import { cookies } from 'next/headers';
import { query, queryOne } from './db';
import { Permission, getEffectivePermissions } from './permissions';
import { hashAdminPassword } from './admin-password';

// Types for admin data
export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  is_system: boolean;
  created_at: string;
}

export interface AdminUser {
  id: string;
  user_id: null; // ALWAYS NULL - admins are standalone only, never linked to customer accounts
  role_id: string;
  custom_permissions: {
    grant: Permission[];
    revoke: Permission[];
  };
  // Admin credential fields (required for all admins)
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  role?: AdminRole;
}

export interface AdminSession {
  // User info - comes from admin_users table (all admins are standalone)
  user: {
    id: string; // This is the admin_users.id
    email: string;
    name: string;
    image: null; // Always null - admins don't have profile images
  };
  adminUser: AdminUser;
  role: AdminRole;
  permissions: Permission[];
  isStandalone: true; // Always true - all admins are standalone (no linked customer accounts)
}

interface AdminSessionRecord {
  id: string;
  admin_user_id: string;
  token: string;
  expires_at: string;
}

interface AdminUserWithDetails {
  id: string;
  user_id: null; // Always null - admins are standalone only
  role_id: string;
  custom_permissions: { grant: Permission[]; revoke: Permission[] };
  // Admin credential fields (required for all admins)
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
  // Joined user fields (no longer used - kept for query compatibility)
  user_email: string | null;
  user_name: string | null;
  user_image: string | null;
  role_name: string;
  role_description: string | null;
  role_permissions: Permission[];
  role_is_system: boolean;
}

// Get the current admin session with permissions (uses separate admin auth)
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('admin_session')?.value;

  if (!sessionToken) {
    return null;
  }

  // Verify session token and get admin user details
  const sessionRecord = await queryOne<AdminSessionRecord>(
    `SELECT * FROM admin_sessions 
     WHERE token = $1 AND expires_at > NOW()`,
    [sessionToken]
  );

  if (!sessionRecord) {
    return null;
  }

  // Get admin user with role and user details (LEFT JOIN user for standalone admins)
  const adminUser = await queryOne<AdminUserWithDetails>(
    `SELECT 
      au.id,
      au.user_id,
      au.role_id,
      au.custom_permissions,
      au.email,
      au.name,
      au.created_at,
      au.updated_at,
      u.email as user_email,
      u.name as user_name,
      u.image as user_image,
      ar.name as role_name,
      ar.description as role_description,
      ar.permissions as role_permissions,
      ar.is_system as role_is_system
    FROM admin_users au
    LEFT JOIN "user" u ON u.id = au.user_id
    JOIN admin_roles ar ON ar.id = au.role_id
    WHERE au.id = $1`,
    [sessionRecord.admin_user_id]
  );

  if (!adminUser) {
    return null;
  }

  // Build role object
  const role: AdminRole = {
    id: adminUser.role_id,
    name: adminUser.role_name,
    description: adminUser.role_description,
    permissions: adminUser.role_permissions,
    is_system: adminUser.role_is_system,
    created_at: adminUser.created_at,
  };

  // Calculate effective permissions
  const permissions = getEffectivePermissions(role.permissions, adminUser.custom_permissions);

  // All admins are standalone (no linked customer accounts)
  return {
    user: {
      id: adminUser.id, // Use admin_users.id as the user id
      email: adminUser.email, // Always from admin_users table
      name: adminUser.name || 'Admin',
      image: null, // Admins don't have profile images
    },
    adminUser: {
      id: adminUser.id,
      user_id: null, // Always null - standalone only
      role_id: adminUser.role_id,
      custom_permissions: adminUser.custom_permissions,
      email: adminUser.email,
      name: adminUser.name,
      created_at: adminUser.created_at,
      updated_at: adminUser.updated_at,
      role,
    },
    role,
    permissions,
    isStandalone: true, // Always true - all admins are standalone
  };
}

// Re-export getEffectivePermissions for backwards compatibility
export { getEffectivePermissions };

// Middleware helper for API routes - checks admin status and optional permission
export async function requireAdmin(permission?: Permission): Promise<{ session: AdminSession; error?: never } | { session?: never; error: Response }> {
  console.log('[requireAdmin] Called with permission:', permission);
  
  const session = await getAdminSession();
  console.log('[requireAdmin] Session result:', { hasSession: !!session });

  if (!session) {
    return {
      error: new Response(JSON.stringify({ error: 'Unauthorized - Admin access required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  if (permission && !session.permissions.includes(permission)) {
    console.log('[requireAdmin] Permission denied:', { required: permission, has: session.permissions });
    return {
      error: new Response(JSON.stringify({ error: `Forbidden - Missing permission: ${permission}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  return { session };
}

// Get all admin roles
export async function getAdminRoles(): Promise<AdminRole[]> {
  return query<AdminRole>('SELECT * FROM admin_roles ORDER BY name');
}

// Get admin role by ID
export async function getAdminRole(roleId: string): Promise<AdminRole | null> {
  return queryOne<AdminRole>('SELECT * FROM admin_roles WHERE id = $1', [roleId]);
}

// Get all admin users with their roles
export async function getAdminUsers(): Promise<(AdminUser & { user_email: string | null; user_name: string | null; role_name: string })[]> {
  return query(
    `SELECT 
      au.*,
      u.email as user_email,
      u.name as user_name,
      ar.name as role_name
    FROM admin_users au
    LEFT JOIN "user" u ON u.id = au.user_id
    JOIN admin_roles ar ON ar.id = au.role_id
    ORDER BY au.created_at DESC`
  );
}

// Get admin user by email (for standalone admins)
export async function getAdminUserByEmail(email: string): Promise<(AdminUser & { password_hash: string | null }) | null> {
  return queryOne(
    `SELECT au.*, ar.name as role_name, ar.permissions as role_permissions
    FROM admin_users au
    JOIN admin_roles ar ON ar.id = au.role_id
    WHERE au.email = $1`,
    [email]
  );
}

// Create standalone admin user with email/password credentials
export async function createStandaloneAdminUser(
  email: string,
  name: string,
  password: string,
  roleId: string,
  customPermissions?: { grant: Permission[]; revoke: Permission[] }
): Promise<AdminUser> {
  const passwordHash = await hashAdminPassword(password);
  
  const result = await queryOne<AdminUser>(
    `INSERT INTO admin_users (email, name, password_hash, password_set_at, role_id, custom_permissions)
    VALUES ($1, $2, $3, NOW(), $4, $5)
    RETURNING *`,
    [
      email,
      name,
      passwordHash,
      roleId,
      JSON.stringify(customPermissions || { grant: [], revoke: [] }),
    ]
  );
  return result!;
}

// Check if standalone admin email already exists
export async function adminEmailExists(email: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    'SELECT id FROM admin_users WHERE email = $1',
    [email]
  );
  return !!result;
}

// Update admin user role
export async function updateAdminUserRole(adminUserId: string, roleId: string): Promise<AdminUser | null> {
  return queryOne<AdminUser>(
    `UPDATE admin_users 
    SET role_id = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [adminUserId, roleId]
  );
}

// Update admin user custom permissions
export async function updateAdminUserPermissions(
  adminUserId: string,
  customPermissions: { grant: Permission[]; revoke: Permission[] }
): Promise<AdminUser | null> {
  return queryOne<AdminUser>(
    `UPDATE admin_users 
    SET custom_permissions = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [adminUserId, JSON.stringify(customPermissions)]
  );
}

// Delete admin user
export async function deleteAdminUser(adminUserId: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    'DELETE FROM admin_users WHERE id = $1 RETURNING id',
    [adminUserId]
  );
  return !!result;
}
