import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { PendingApprovalsTable } from './pending-approvals-table';

interface PendingApproval {
  id: number;
  purchase_order_id: number;
  po_number: string;
  vendor_name: string;
  buyer_name: string;
  total_amount: number;
  requested_by: string | null;
  requested_at: string;
  status: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  approval_threshold: number | null;
}

async function getPendingApprovals(): Promise<PendingApproval[]> {
  try {
    const approvals = await query<PendingApproval>(
      `SELECT 
        ar.id,
        ar.purchase_order_id,
        po.po_number,
        v.name as vendor_name,
        po.buyer_name,
        po.total_amount,
        ar.requested_by,
        ar.requested_at,
        ar.status,
        ar.assigned_to,
        ar.approval_threshold,
        au.name as assigned_to_name
      FROM po_approval_requests ar
      JOIN purchase_orders po ON po.id = ar.purchase_order_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN admin_users au ON au.id = ar.assigned_to
      WHERE ar.status = 'PENDING'
      ORDER BY ar.requested_at DESC`
    );

    return approvals;
  } catch (error) {
    console.error('Failed to fetch pending approvals:', error);
    return [];
  }
}

export default async function PendingApprovalsPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const pendingApprovals = await getPendingApprovals();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Pending Purchase Order Approvals</h1>
        <p className="mt-1 text-slate-500">
          Review and approve purchase orders that have been submitted
        </p>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No pending approvals at this time.</p>
        </div>
      ) : (
        <PendingApprovalsTable 
          approvals={pendingApprovals} 
          permissions={session.permissions}
        />
      )}
    </div>
  );
}

