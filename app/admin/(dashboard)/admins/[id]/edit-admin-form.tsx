'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X, Key, Eye, EyeOff, Shield, UserCircle } from 'lucide-react';
import { AdminRole } from '@/lib/admin-auth';
import {
  Permission,
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  getEffectivePermissions
} from '@/lib/permissions';

interface AdminUser {
  id: string;
  user_id: string | null;
  role_id: string;
  custom_permissions: { grant: Permission[]; revoke: Permission[] };
  // Standalone admin fields
  email: string | null;
  name: string | null;
  // Joined user fields (null for standalone)
  user_email: string | null;
  user_name: string | null;
  role_name: string;
  role_permissions: Permission[];
  password_set_at?: string | null;
}

interface EditAdminFormProps {
  adminUser: AdminUser;
  roles: AdminRole[];
  canUpdateRole: boolean;
  canManagePermissions: boolean;
}

export function EditAdminForm({
  adminUser,
  roles,
  canUpdateRole,
  canManagePermissions,
}: EditAdminFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Password management state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [selectedRole, setSelectedRole] = useState(adminUser.role_id);
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>(
    adminUser.custom_permissions?.grant || []
  );
  const [revokedPermissions, setRevokedPermissions] = useState<Permission[]>(
    adminUser.custom_permissions?.revoke || []
  );

  // Helper to determine if this is a standalone admin
  const isStandalone = !adminUser.user_id;
  
  // Get display name/email - prefer linked user, fallback to standalone admin fields
  const displayName = adminUser.user_name || adminUser.name || 'Unknown';
  const displayEmail = adminUser.user_email || adminUser.email || '';

  // Get the current role's permissions
  const currentRole = roles.find((r) => r.id === selectedRole);
  const rolePermissions = currentRole?.permissions || adminUser.role_permissions;

  // Calculate effective permissions
  const effectivePermissions = getEffectivePermissions(rolePermissions, {
    grant: grantedPermissions,
    revoke: revokedPermissions,
  });

  const handleRoleChange = async () => {
    if (!canUpdateRole || selectedRole === adminUser.role_id) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/admins/${adminUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const handlePermissionsChange = async () => {
    if (!canManagePermissions) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/admins/${adminUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customPermissions: {
            grant: grantedPermissions,
            revoke: revokedPermissions,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update permissions');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (permission: Permission, type: 'grant' | 'revoke') => {
    if (type === 'grant') {
      if (grantedPermissions.includes(permission)) {
        setGrantedPermissions(grantedPermissions.filter((p) => p !== permission));
      } else {
        setGrantedPermissions([...grantedPermissions, permission]);
        // Remove from revoked if it was there
        setRevokedPermissions(revokedPermissions.filter((p) => p !== permission));
      }
    } else {
      if (revokedPermissions.includes(permission)) {
        setRevokedPermissions(revokedPermissions.filter((p) => p !== permission));
      } else {
        setRevokedPermissions([...revokedPermissions, permission]);
        // Remove from granted if it was there
        setGrantedPermissions(grantedPermissions.filter((p) => p !== permission));
      }
    }
  };

  const handlePasswordChange = async () => {
    if (!canManagePermissions) return;
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/admins/${adminUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update password');
      }

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Admin password updated successfully');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-primary">{success}</div>
      )}

      {/* User Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg mb-4 font-semibold text-slate-900">Admin Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Name</p>
            <p className="font-medium text-slate-900">{displayName}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Email</p>
            <p className="font-medium text-slate-900">{displayEmail}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Account Type</p>
            <div className="flex items-center gap-2 mt-1">
              {isStandalone ? (
                <>
                  <Shield className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-medium text-violet-600">Standalone Admin</span>
                </>
              ) : (
                <>
                  <UserCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-600">Linked to Customer Account</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role Selection */}
      {canUpdateRole && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg mb-4 font-semibold text-slate-900">Role</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRole(role.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  selectedRole === role.id
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-medium text-slate-900">{role.name}</p>
                <p className="mt-1 text-sm text-slate-500">{role.description}</p>
              </button>
            ))}
          </div>
          {selectedRole !== adminUser.role_id && (
            <button
              onClick={handleRoleChange}
              disabled={saving}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Role Change
            </button>
          )}
        </div>
      )}

      {/* Custom Permissions */}
      {canManagePermissions && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg mb-4 font-semibold text-slate-900">Custom Permissions</h2>
          <p className="mb-6 text-sm text-slate-500">
            Grant additional permissions or revoke existing ones from this admin&apos;s role.
          </p>

          <div className="space-y-6">
            {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => (
              <div key={key}>
                <h3 className="mb-3 text-sm font-medium text-slate-700">
                  {category.label}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {category.permissions.map((permission) => {
                    const hasFromRole = rolePermissions.includes(permission);
                    const isGranted = grantedPermissions.includes(permission);
                    const isRevoked = revokedPermissions.includes(permission);
                    const isEffective = effectivePermissions.includes(permission);

                    return (
                      <div
                        key={permission}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          isEffective
                            ? 'border-green-200 bg-green-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {PERMISSIONS[permission]}
                          </p>
                          <p className="text-xs text-slate-500">{permission}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {hasFromRole ? (
                            // Permission from role - can only revoke
                            <button
                              onClick={() => togglePermission(permission, 'revoke')}
                              className={`rounded p-1 ${
                                isRevoked
                                  ? 'bg-red-100 text-red-600'
                                  : 'text-slate-400 hover:bg-slate-200'
                              }`}
                              title={isRevoked ? 'Restore permission' : 'Revoke permission'}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : (
                            // Permission not from role - can grant
                            <button
                              onClick={() => togglePermission(permission, 'grant')}
                              className={`rounded p-1 ${
                                isGranted
                                  ? 'bg-green-100 text-primary'
                                  : 'text-slate-400 hover:bg-slate-200'
                              }`}
                              title={isGranted ? 'Remove grant' : 'Grant permission'}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {(grantedPermissions.length > 0 ||
            revokedPermissions.length > 0 ||
            adminUser.custom_permissions?.grant?.length > 0 ||
            adminUser.custom_permissions?.revoke?.length > 0) && (
            <button
              onClick={handlePermissionsChange}
              disabled={saving}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Permission Changes
            </button>
          )}
        </div>
      )}

      {/* Admin Password Management */}
      {canManagePermissions && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Admin Portal Password</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            {isStandalone
              ? 'Set or reset the password for this standalone admin account.'
              : 'Set or reset the password this admin uses to log into the admin portal. This is separate from their customer account password.'}
          </p>
          
          {adminUser.password_set_at ? (
            <p className="mb-4 text-sm text-slate-600">
              Password last set: {new Date(adminUser.password_set_at).toLocaleDateString()}
            </p>
          ) : (
            <p className="mb-4 text-sm text-amber-600">
              ⚠️ No admin password set. This admin cannot log into the admin portal.
            </p>
          )}

          <div className="space-y-4 max-w-md">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handlePasswordChange}
              disabled={savingPassword || !newPassword || !confirmPassword}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              {adminUser.password_set_at ? 'Update Password' : 'Set Password'}
            </button>
          </div>
        </div>
      )}

      {/* Back Link */}
      <div className="flex items-center">
        <Link
          href="/admin/admins"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admins
        </Link>
      </div>
    </div>
  );
}
