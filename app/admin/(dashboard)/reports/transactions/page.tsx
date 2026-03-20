import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { TransactionReportClient } from './client';

export default async function TransactionsReportPage() {
  const session = await getAdminSession();
  
  if (!session) {
    redirect('/admin/login');
  }

  const permissions = session.permissions;
  
  // Check if user has permission to view transaction reports
  if (!permissions.includes('reports.view_transactions')) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">
          You don&apos;t have permission to view inventory transaction reports
        </p>
      </div>
    );
  }

  return <TransactionReportClient />;
}
