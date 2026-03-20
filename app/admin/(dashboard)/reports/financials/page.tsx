import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { FinancialReportsClient } from './client';

export default async function FinancialsReportPage() {
  const session = await getAdminSession();
  
  if (!session) {
    redirect('/admin/login');
  }

  const permissions = session.permissions;
  
  // Check if user has any report permissions
  const hasOverview = permissions.includes('reports.view_overview');
  const hasPL = permissions.includes('reports.view_profit_loss');
  const hasBS = permissions.includes('reports.view_balance_sheet');
  
  if (!hasOverview && !hasPL && !hasBS) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">You don&apos;t have permission to view financial reports</p>
      </div>
    );
  }

  return (
    <FinancialReportsClient 
      hasOverview={hasOverview}
      hasPL={hasPL}
      hasBS={hasBS}
    />
  );
}
