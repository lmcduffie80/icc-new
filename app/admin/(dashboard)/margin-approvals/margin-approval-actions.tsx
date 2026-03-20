'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface MarginApprovalActionsProps {
  productId: string;
  productName: string;
}

export function MarginApprovalActions({ productId, productName }: MarginApprovalActionsProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const handleAction = async (action: 'approve' | 'reject') => {
    if (processing) return;

    const confirmed = confirm(
      `Are you sure you want to ${action} the margin split for "${productName}"?${notes ? `\n\nNotes: ${notes}` : ''}`
    );

    if (!confirmed) return;

    setProcessing(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/products/${productId}/margin-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${action} margin`);
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} margin`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Notes Section */}
      {showNotes && (
        <div className="space-y-2">
          <label htmlFor="margin-action-notes" className="block text-sm font-medium text-slate-700">
            Notes (optional)
          </label>
          <textarea
            id="margin-action-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500"
            placeholder="Add any notes about this decision..."
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setShowNotes(!showNotes)}
          className="text-sm text-slate-600 hover:text-slate-900 underline"
        >
          {showNotes ? 'Hide' : 'Add'} notes
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleAction('reject')}
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                <span>Reject</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Approve</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
