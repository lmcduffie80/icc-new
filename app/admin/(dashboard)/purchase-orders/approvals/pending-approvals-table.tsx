'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Eye, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/admin/data-table';

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

interface PendingApprovalsTableProps {
  approvals: PendingApproval[];
  permissions: string[];
}

export function PendingApprovalsTable({ approvals }: PendingApprovalsTableProps) {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleApprove = async (poId: number, approvalId: number) => {
    setProcessingId(approvalId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/purchase-orders/${poId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve purchase order');
      }

      setSuccess('Purchase order approved successfully');
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve purchase order');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (poId: number, approvalId: number, reason?: string) => {
    const rejectionReason = reason || prompt('Please provide a reason for rejection:');
    if (!rejectionReason) {
      setError('Rejection reason is required');
      return;
    }

    setProcessingId(approvalId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/purchase-orders/${poId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECT',
          rejection_reason: rejectionReason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject purchase order');
      }

      setSuccess('Purchase order rejected successfully');
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject purchase order');
    } finally {
      setProcessingId(null);
    }
  };

  const columns = [
    {
      key: 'po_number',
      header: 'PO Number',  
      render: (approval: PendingApproval) => (
        <Link
          href={`/admin/purchase-orders/${approval.purchase_order_id}/edit`}
          className="font-medium text-emerald-600 hover:text-emerald-700"
        >
          {approval.po_number}
        </Link>
      ),
    },
    {
      key: 'vendor_name',
      header: 'Vendor',
      render: (approval: PendingApproval) => approval.vendor_name || 'Unknown',
    },
    {
      key: 'buyer_name',
      header: 'Buyer',
      render: (approval: PendingApproval) => approval.buyer_name,
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      render: (approval: PendingApproval) => (
        <div className="flex items-center gap-2">
          <span className={approval.approval_threshold ? 'font-semibold text-amber-600' : ''}>
            {formatCurrency(Number(approval.total_amount))}
          </span>
          {approval.approval_threshold && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              High Value
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'assigned_to',
      header: 'Assigned To',
      render: (approval: PendingApproval) => (
        approval.assigned_to_name ? (
          <span className="text-sm text-slate-700 font-medium">{approval.assigned_to_name}</span>
        ) : (
          <span className="text-sm text-slate-400">Any Admin</span>
        )
      ),
    },
    {
      key: 'requested_at',
      header: 'Submitted',
      render: (approval: PendingApproval) => formatDate(approval.requested_at),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (approval: PendingApproval) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/purchase-orders/${approval.purchase_order_id}/edit`}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="View Details"
          >
            <Eye className="h-3 w-3" />
            View
          </Link>
          <button
            onClick={() => handleApprove(approval.purchase_order_id, approval.id)}
            disabled={processingId === approval.id}
            className="inline-flex items-center gap-1 rounded border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            title="Approve"
          >
            {processingId === approval.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Approve
          </button>
          <button
            onClick={() => handleReject(approval.purchase_order_id, approval.id)}
            disabled={processingId === approval.id}
            className="inline-flex items-center gap-1 rounded border border-red-600 bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            title="Reject"
          >
            {processingId === approval.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
            Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          {success}
        </div>
      )}
      <DataTable 
        data={approvals} 
        columns={columns}
        keyExtractor={(approval) => approval.id.toString()}
        searchKeys={['po_number', 'vendor_name', 'buyer_name']}
        searchPlaceholder="Search by PO number, vendor, or buyer..."
      />
    </div>
  );
}

