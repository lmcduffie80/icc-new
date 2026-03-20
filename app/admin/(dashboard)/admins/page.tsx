import { getAdminSession, getAdminUsers, getAdminRoles } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AdminsTable } from './admins-table';

export default async function AdminsPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.view')) {
    redirect('/admin');
  }

  const [admins, roles] = await Promise.all([
    getAdminUsers(),
    getAdminRoles(),
  ]);

  const canCreate = session.permissions.includes('admins.create');

  // Count standalone vs linked admins
  const standaloneCount = admins.filter(a => !a.user_id).length;
  const linkedCount = admins.filter(a => a.user_id).length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Users</h1>
          <p className="mt-1 text-slate-500">Manage administrators and their permissions</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/admins/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Admin
          </Link>
        )}
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        {/* Total Admins */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Total Admins</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {admins.length}
            </span>
          </div>
          <div className="mt-2 flex gap-3 text-sm text-slate-500">
            <span>{standaloneCount} standalone</span>
            <span>•</span>
            <span>{linkedCount} linked</span>
          </div>
        </div>

        {/* Role Cards */}
        {roles.map((role) => (
          <div
            key={role.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{role.name}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {admins.filter((a) => a.role_id === role.id).length} users
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{role.description}</p>
          </div>
        ))}
      </div>

      <AdminsTable
        admins={admins}
        roles={roles}
        permissions={session.permissions}
        currentAdminId={session.adminUser.id}
      />
    </div>
  );
}
