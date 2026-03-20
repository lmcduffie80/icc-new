'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface PendingApproval {
  product_id: string;
  product_name: string;
  admin_label_url: string | null;
  label_url: string | null;
  approval_notes: string | null;
  updated_at: string;
}

export function ApprovalsList() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    async function fetchApprovals() {
      try {
        const response = await fetch('/api/supplier/approvals');
        if (!response.ok) {
          throw new Error('Failed to fetch approvals');
        }
        const data = await response.json();
        setApprovals(data.approvals || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load approvals');
      } finally {
        setLoading(false);
      }
    }

    fetchApprovals();
  }, []);

  async function handleApproval(productId: string, action: 'approve' | 'reject') {
    setProcessing(productId);
    try {
      // Get token from API
      const tokenResponse = await fetch(`/api/supplier/products/${productId}/get-approval-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get approval token');
      }

      const { token } = await tokenResponse.json();

      // Call the approval endpoint
      const response = await fetch(`/api/supplier/products/${productId}/${action === 'approve' ? 'approve' : 'reject'}-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${action} label`);
      }

      // Remove from list
      setApprovals((prev) => prev.filter((a) => a.product_id !== productId));
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} label`);
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-800">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">No Pending Approvals</h3>
        <p className="mt-2 text-sm text-slate-500">
          All label changes have been reviewed and approved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((approval) => (
        <div
          key={approval.product_id}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">
                {approval.product_name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Label modified on {new Date(approval.updated_at).toLocaleDateString()}
              </p>

              {approval.approval_notes && (
                <div className="mt-3 rounded-md bg-blue-50 p-3">
                  <p className="text-sm font-medium text-blue-900">Admin Notes:</p>
                  <p className="mt-1 text-sm text-blue-700">{approval.approval_notes}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-4">
                {approval.label_url && (
                  <a
                    href={approval.label_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Original Label
                  </a>
                )}
                {approval.admin_label_url && (
                  <a
                    href={approval.admin_label_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Modified Label
                  </a>
                )}
                <Link
                  href={`/supplier/products/${approval.product_id}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Product
                </Link>
              </div>
            </div>

            <div className="ml-4 flex gap-2">
              <button
                onClick={() => handleApproval(approval.product_id, 'approve')}
                disabled={processing === approval.product_id}
                className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {processing === approval.product_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
              <button
                onClick={() => handleApproval(approval.product_id, 'reject')}
                disabled={processing === approval.product_id}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {processing === approval.product_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

