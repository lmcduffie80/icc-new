'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2, DollarSign, Package } from 'lucide-react';
import { getGallonsFromContainerSize } from '@/lib/utils';

interface ProductWithMargin {
  id: string;
  name: string;
  category: string;
  price: string;
  supplier_price: string;
  admin_proposed_margin_percent: string;
  supplier_margin_approval_status: string;
  admin_proposed_margin_at: string | null;
  admin_proposed_margin_by: string;
  margin_proposal_source: string;
  approval_status: string;
  supplier_id: string;
  admin_name: string;
  attributes: {
    containerSizes?: string;
  } | null;
}

interface SupplierMarginApprovalFormProps {
  product: ProductWithMargin;
}

export function SupplierMarginApprovalForm({ product }: SupplierMarginApprovalFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  const storePrice = parseFloat(product.price) || 0;
  const supplierPrice = parseFloat(product.supplier_price) || 0;
  const margin = storePrice - supplierPrice;
  const proposedPercent = parseFloat(product.admin_proposed_margin_percent) || 0;
  const platformShare = margin * (proposedPercent / 100);
  const supplierKeeps = margin - platformShare;

  // Check if product has gallon pricing
  const containerSizes = product.attributes?.containerSizes;
  const gallons = containerSizes ? getGallonsFromContainerSize(containerSizes) : 0;
  const hasGallonPricing = gallons !== null && gallons > 0;

  const storePricePerGallon = hasGallonPricing && gallons ? storePrice / gallons : storePrice;
  const supplierPricePerGallon = hasGallonPricing && gallons ? supplierPrice / gallons : supplierPrice;

  const handleAction = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !notes.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const response = await fetch(`/api/supplier/products/${product.id}/approve-admin-margin`, {
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

      router.push('/supplier/products');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} margin`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-slate-500" />
            Product Details
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-slate-500">Product Name</dt>
              <dd className="text-sm font-medium text-slate-900">{product.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Category</dt>
              <dd className="text-sm font-medium text-slate-900">{product.category}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Proposed By</dt>
              <dd className="text-sm font-medium text-slate-900">{product.admin_name || 'Admin'}</dd>
            </div>
            {product.admin_proposed_margin_at && (
              <div>
                <dt className="text-sm text-slate-500">Proposed On</dt>
                <dd className="text-sm font-medium text-slate-900">
                  {new Date(product.admin_proposed_margin_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Pricing Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-slate-500" />
            Pricing
          </h2>

          {hasGallonPricing ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Store Price Per Gallon</p>
                <p className="text-2xl font-bold text-green-600">${storePricePerGallon.toFixed(4)}/gal</p>
                <p className="text-xs text-slate-500 mt-1">Container: {containerSizes} ({gallons} gallons)</p>
                <p className="text-sm text-slate-600 mt-2">Total: ${storePrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Your Price Per Gallon</p>
                <p className="text-2xl font-bold text-green-600">${supplierPricePerGallon.toFixed(4)}/gal</p>
                <p className="text-sm text-slate-600 mt-2">Total: ${supplierPrice.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Store Price</span>
                <span className="text-sm font-semibold text-slate-900">${storePrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Your Cost</span>
                <span className="text-sm font-semibold text-slate-900">${supplierPrice.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Margin Breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Proposed Margin Split</h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center py-3 border-b border-slate-100">
            <span className="text-sm text-slate-600">Total Margin (per unit)</span>
            <span className="text-lg font-semibold text-green-600">${margin.toFixed(2)}</span>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <span className="text-3xl font-bold text-blue-600">{proposedPercent.toFixed(1)}%</span>
            <p className="text-sm text-blue-700 mt-1">Proposed Platform Share</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-slate-50 p-4 text-center">
              <span className="text-xl font-semibold text-slate-900">${platformShare.toFixed(2)}</span>
              <p className="text-xs text-slate-500 mt-1">Platform Share</p>
            </div>
            <div className="rounded-lg bg-green-50 p-4 text-center border-2 border-green-200">
              <span className="text-xl font-semibold text-green-600">${supplierKeeps.toFixed(2)}</span>
              <p className="text-xs text-slate-500 mt-1">You Keep</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Your Decision</h2>

        <div className="mb-6">
          <label htmlFor="approval-notes" className="block text-sm font-medium text-slate-700 mb-2">
            Notes <span className="text-slate-400">(required for rejection)</span>
          </label>
          <textarea
            id="approval-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter any notes or reason for rejection..."
            className="block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            disabled={submitting}
          />
        </div>

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => handleAction('reject')}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-6 py-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex items-center gap-2 rounded-md bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
}
