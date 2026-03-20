'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApprovalFormProps {
  poId: number;
  poNumber: string;
  approvalStatus: string;
  requestedAt: string;
  assignedTo: string | null;
}

export function ApprovalForm({ 
  poId, 
  approvalStatus, 
  requestedAt,
  assignedTo 
}: ApprovalFormProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApprove = async () => {
    setIsProcessing(true);
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

      setSuccess('Purchase order approved successfully!');
      setTimeout(() => {
        router.push('/admin/purchase-orders/approvals');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve purchase order');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Rejection reason is required');
      return;
    }

    setIsProcessing(true);
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

      setSuccess('Purchase order rejected successfully!');
      setTimeout(() => {
        router.push('/admin/purchase-orders/approvals');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject purchase order');
    } finally {
      setIsProcessing(false);
    }
  };

  if (approvalStatus !== 'PENDING') {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Approval Status</h2>
        <p className="text-sm">
          This purchase order has already been{' '}
          <span className="font-semibold">
            {approvalStatus === 'APPROVED' ? 'approved' : 
             approvalStatus === 'REJECTED' ? 'rejected' : 
             approvalStatus.toLowerCase()}
          </span>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-xl font-semibold mb-4">Approval Required</h2>
      
      <div className="mb-4 text-sm text-muted-foreground">
        <p>Requested: {new Date(requestedAt).toLocaleString()}</p>
        {assignedTo && <p>Assigned to: {assignedTo}</p>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded">
          {success}
        </div>
      )}

      {!showRejectForm ? (
        <div className="flex gap-4">
          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Approve
              </>
            )}
          </Button>
          <Button
            onClick={() => setShowRejectForm(true)}
            disabled={isProcessing}
            variant="destructive"
          >
            <X className="mr-2 h-4 w-4" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="rejection-reason" className="text-sm font-medium mb-2 block">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectionReason(e.target.value)}
              placeholder="Please provide a reason for rejecting this purchase order..."
              rows={4}
              disabled={isProcessing}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
            />
          </div>
          <div className="flex gap-4">
            <Button
              onClick={handleReject}
              disabled={isProcessing || !rejectionReason.trim()}
              variant="destructive"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Confirm Rejection
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                setShowRejectForm(false);
                setRejectionReason('');
                setError('');
              }}
              disabled={isProcessing}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
