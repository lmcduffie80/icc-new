import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { BillOfMaterialsClient } from './client';

export default async function BillOfMaterialsPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  if (!session.permissions.includes('reports.view_transactions')) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">
          You don&apos;t have permission to view the Bill of Materials report
        </p>
      </div>
    );
  }

  return <BillOfMaterialsClient />;
}
