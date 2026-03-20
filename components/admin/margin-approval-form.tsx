'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2, DollarSign, Building2, Package } from 'lucide-react';

interface ProductWithMargin {
  id: string;
  name: string;
  category: string;
  price: string;
  supplier_price: string;
  margin_split_percentage: string;
  margin_approval_status: string;
  margin_approval_notes: string | null;
  margin_submitted_at: string | null;
  approval_status: string;
  supplier_id: string;
  supplier_name: string;
  supplier_company: string;
  supplier_email: string;
}

interface MarginApprovalFormProps {
  product: ProductWithMargin;
}

export function MarginApprovalForm({ product }: MarginApprovalFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  const storePrice = parseFloat(product.price) || 0;
  const supplierPrice = parseFloat(product.supplier_price) || 0;
  const margin = storePrice - supplierPrice;
  const splitPercentage = parseFloat(product.margin_split_percentage) || 0;
  const platformShare = margin * (splitPercentage / 100);
  const supplierKeeps = margin - platformShare;

  const handleAction = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !notes.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const response = await fetch(`/api/admin/products/${product.id}/margin/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} margin`);
      }

      router.push('/admin/margin-approvals');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} margin`);
    } finally {
      setSubmitting(false);
    }
  };

  const isAlreadyDecided = product.margin_approval_status === 'approved' || product.margin_approval_status === 'rejected';

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {isAlreadyDecided && (
        <div className={`rounded-lg border p-4 ${
          product.margin_approval_status === 'approved'
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <p className={`text-sm font-medium ${
            product.margin_approval_status === 'approved'
              ? 'text-green-800'
              : 'text-red-800'
          }`}>
            This margin has already been {product.margin_approval_status}.
            {product.margin_approval_notes && (
              <span className="block mt-1 font-normal">Notes: {product.margin_approval_notes}</span>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product & Supplier Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            Product Details
          </h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-slate-500">Product Name</dt>
              <dd className="text-sm font-medium text-slate-900">{product.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Category</dt>
              <dd className="text-sm font-medium text-slate-900">{product.category}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Product Status</dt>
              <dd>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  product.approval_status === 'published'
                    ? 'bg-green-100 text-green-800'
                    : product.approval_status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : product.approval_status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {product.approval_status}
                </span>
              </dd>
            </div>
            {product.margin_submitted_at && (
              <div>
                <dt className="text-sm text-slate-500">Margin Submitted</dt>
                <dd className="text-sm font-medium text-slate-900">
                  {new Date(product.margin_submitted_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>

          <h3 className="text-md font-semibold text-slate-900 mt-4 mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            Supplier Information
          </h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-slate-500">Supplier Name</dt>
              <dd className="text-sm font-medium text-slate-900">{product.supplier_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Company</dt>
              <dd className="text-sm font-medium text-slate-900">{product.supplier_company}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="text-sm font-medium text-slate-900">{product.supplier_email}</dd>
            </div>
          </dl>
        </div>

        {/* Margin Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-slate-500" />
            Margin Breakdown
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Store Price</span>
              <span className="text-sm font-semibold text-slate-900">${storePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Supplier Cost</span>
              <span className="text-sm font-semibold text-slate-900">${supplierPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Margin</span>
              <span className="text-sm font-semibold text-green-600">${margin.toFixed(2)}</span>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="text-center mb-4">
                <span className="text-xl font-bold text-slate-900">{splitPercentage}%</span>
                <p className="text-sm text-slate-500">Margin Split to Platform</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <span className="text-base font-semibold text-slate-900">${platformShare.toFixed(2)}</span>
                  <p className="text-xs text-slate-500">Platform Share</p>
                </div>
                <div className="rounded-lg bg-green-50 p-4 text-center">
                  <span className="text-base font-semibold text-green-600">${supplierKeeps.toFixed(2)}</span>
                  <p className="text-xs text-slate-500">Supplier Keeps</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Section */}
      {!isAlreadyDecided && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Decision</h2>

          <div className="mb-4">
            <label htmlFor="margin-approval-notes" className="block text-sm font-medium text-slate-700">
              Notes <span className="text-slate-400">(required for rejection)</span>
            </label>
            <textarea
              id="margin-approval-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any notes or reason for rejection..."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              disabled={submitting}
            />
          </div>

          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => handleAction('reject')}
              disabled={submitting}
              className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Reject Margin
            </button>
            <button
              type="button"
              onClick={() => handleAction('approve')}
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve Margin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
