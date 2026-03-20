import { getAdminSession, getAdminRoles } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { NewAdminForm } from './new-admin-form';

export default async function NewAdminPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.create')) {
    redirect('/admin/admins');
  }

  const roles = await getAdminRoles();

  // Filter out super-admin role if current user is not a super admin
  const filteredRoles = session.role.id === 'super-admin'
    ? roles
    : roles.filter((r) => r.id !== 'super-admin');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Add New Admin</h1>
        <p className="mt-1 text-slate-500">Create a new standalone admin account with custom permissions</p>
      </div>

      <NewAdminForm roles={filteredRoles} />
    </div>
  );
}
