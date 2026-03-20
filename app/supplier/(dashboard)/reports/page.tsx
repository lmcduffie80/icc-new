import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { FinancialReportClient } from './client';

export default async function SupplierReportsPage() {
  const session = await getSupplierSession();
  
  if (!session) {
    redirect('/supplier/login');
  }

  return <FinancialReportClient />;
}
