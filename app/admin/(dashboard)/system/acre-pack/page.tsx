import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { AcrePackManager } from './acre-pack-manager';

export const metadata = {
  title: 'Crop Planning Programs - Admin Dashboard',
  description: 'Manage Innovative Crop Planning programs, application passes, and product assignments',
};

export default async function AcrePackAdminPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('acrepack.view')) {
    redirect('/admin');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Innovative Crop Planning Programs</h1>
        <p className="mt-1 text-slate-500">
          Manage crop programs, application passes, and product assignments for the Crop Planning portal.
          Changes take effect immediately on the public store.
        </p>
      </div>

      <AcrePackManager />
    </div>
  );
}
