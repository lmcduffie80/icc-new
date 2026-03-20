import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { ApprovalsTabs } from '@/components/supplier/approvals-tabs';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Approvals / Rejections</h1>
        <p className="mt-1 text-slate-500">
          Review pending label changes and rejected products
        </p>
      </div>

      <ApprovalsTabs />
    </div>
  );
}

