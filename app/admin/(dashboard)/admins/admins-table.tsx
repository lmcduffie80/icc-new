'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/data-table';
import { Permission } from '@/lib/permissions';
import { AdminRole } from '@/lib/admin-auth';
import { Edit, Trash2, Shield, UserCircle } from 'lucide-react';

interface AdminUser {
  id: string;
  user_id: string | null;
  role_id: string;
  custom_permissions: { grant: Permission[]; revoke: Permission[] };
  // Standalone admin fields
  email: string | null;
  name: string | null;
  created_at: string;
  // Joined user fields (null for standalone)
  user_email: string | null;
  user_name: string | null;
  role_name: string;
}

interface AdminsTableProps {
  admins: AdminUser[];
  roles: AdminRole[];
  permissions: Permission[];
  currentAdminId: string;
}

export function AdminsTable({ admins, permissions, currentAdminId }: AdminsTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const canUpdate = permissions.includes('admins.update');
  const canDelete = permissions.includes('admins.delete');
  const canManagePermissions = permissions.includes('admins.manage_permissions');

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this admin?')) return;

    setDeleting(id);
    try {
      const response = await fetch(`/api/admin/admins/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete admin');
      }
    } catch (error) {
      console.error('Error deleting admin:', error);
      alert('Failed to delete admin');
    } finally {
      setDeleting(null);
    }
  };

  const roleColors: Record<string, string> = {
    'super-admin': 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    support: 'bg-green-100 text-green-800',
  };

  // Helper to get display name/email - prefer linked user, fallback to standalone admin fields
  const getDisplayName = (admin: AdminUser) => admin.user_name || admin.name || 'Unknown';
  const getDisplayEmail = (admin: AdminUser) => admin.user_email || admin.email || '';
  const isStandalone = (admin: AdminUser) => !admin.user_id;

  const columns: Column<AdminUser>[] = [
    {
      key: 'user_name',
      header: 'Admin',
      sortable: true,
      render: (admin) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isStandalone(admin) ? 'bg-violet-100' : 'bg-emerald-100'
          }`}>
            {isStandalone(admin) ? (
              <Shield className="h-5 w-5 text-violet-600" />
            ) : (
              <UserCircle className="h-5 w-5 text-emerald-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">
                {getDisplayName(admin)}
              </p>
              {admin.id === currentAdminId && (
                <span className="text-xs text-slate-400">(You)</span>
              )}
              {isStandalone(admin) && (
                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 uppercase tracking-wide">
                  Standalone
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{getDisplayEmail(admin)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role_name',
      header: 'Role',
      sortable: true,
      render: (admin) => (
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
            roleColors[admin.role_id] || 'bg-slate-100 text-slate-800'
          }`}
        >
          {admin.role_name}
        </span>
      ),
    },
    {
      key: 'custom_permissions',
      header: 'Custom Permissions',
      render: (admin) => {
        const { grant = [], revoke = [] } = admin.custom_permissions || {};
        const hasCustom = grant.length > 0 || revoke.length > 0;
        return hasCustom ? (
          <div className="flex items-center gap-2">
            {grant.length > 0 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                +{grant.length}
              </span>
            )}
            {revoke.length > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                -{revoke.length}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-400">None</span>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Added',
      sortable: true,
      render: (admin) => (
        <span className="text-slate-500">
          {new Date(admin.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const actions = (admin: AdminUser) => (
    <div className="flex items-center justify-end gap-2">
      {(canUpdate || canManagePermissions) && (
        <Link
          href={`/admin/admins/${admin.id}`}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Edit className="h-4 w-4" />
        </Link>
      )}
      {canDelete && admin.id !== currentAdminId && (
        <button
          onClick={() => handleDelete(admin.id)}
          disabled={deleting === admin.id}
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <DataTable
      data={admins}
      columns={columns}
      keyExtractor={(admin) => admin.id}
      searchKeys={['user_name', 'user_email', 'name', 'email', 'role_name']}
      searchPlaceholder="Search admins..."
      emptyMessage="No admin users found"
      actions={actions}
    />
  );
}
