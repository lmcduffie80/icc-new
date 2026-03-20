'use client';

import { useState, useEffect } from 'react';
import { Check, X, Loader2, DollarSign, Package } from 'lucide-react';
import { getGallonsFromContainerSize } from '@/lib/utils';

interface ProductWithMargin {
  id: string;
  name: string;
  category: string;
  price: string;
  supplier_price: string | null;
  original_price: string | null;
  admin_proposed_margin_percent?: string | null;
  supplier_margin_approval_status?: string | null;
  admin_proposed_margin_at?: string | null;
  margin_proposal_source?: string | null;
  attributes?: { containerSizes?: string } | null;
}

interface MarginApprovalModalProps {
  product: ProductWithMargin;
  onSuccess: () => void;
  onClose: () => void;
}

export function MarginApprovalModal({ product, onSuccess, onClose }: MarginApprovalModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [submitting, onClose]);

  const storePrice = parseFloat(product.price) || 0;
  const rawSupplierPrice = product.original_price ?? product.supplier_price ?? product.price;
  const supplierPrice = parseFloat(rawSupplierPrice) || 0;
  const proposedPercent = parseFloat(product.admin_proposed_margin_percent ?? '0') || 0;
  const margin = storePrice - supplierPrice;
  const platformShare = margin * (proposedPercent / 100);
  const supplierKeeps = margin - platformShare;

  const containerSizes = product.attributes?.containerSizes ?? null;
  const gallons = containerSizes ? getGallonsFromContainerSize(containerSizes) : null;
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

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} margin`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="margin-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />

      {/* Dialog card */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="margin-modal-title" className="text-lg font-semibold text-slate-900">
              Margin Approval Request
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{product.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 hover:cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Product info + pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Product
              </h3>
              <p className="text-sm font-medium text-slate-900">{product.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{product.category}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Pricing
              </h3>
              {hasGallonPricing ? (
                <div className="space-y-1">
                  <div>
                    <p className="text-xs text-slate-500">Store/gal</p>
                    <p className="text-sm font-bold text-slate-900">${storePricePerGallon.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Your cost/gal</p>
                    <p className="text-sm font-bold text-slate-900">${supplierPricePerGallon.toFixed(4)}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Store</span>
                    <span className="font-semibold text-slate-900">${storePrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Your cost</span>
                    <span className="font-semibold text-slate-900">${supplierPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Proposed margin split */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Proposed Margin Split</h3>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 mb-3">
              <span className="text-sm text-slate-600">Total margin per unit</span>
              <span className="text-sm font-semibold text-emerald-600">${margin.toFixed(2)}</span>
            </div>

            <div className="bg-blue-50 rounded-lg px-4 py-3 text-center mb-3">
              <span className="text-2xl font-bold text-blue-600">{proposedPercent.toFixed(1)}%</span>
              <p className="text-xs text-blue-700 mt-0.5">Proposed platform share</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <span className="text-base font-semibold text-slate-900">${platformShare.toFixed(2)}</span>
                <p className="text-xs text-slate-500 mt-0.5">Platform share</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border-2 border-emerald-200 p-3 text-center">
                <span className="text-base font-semibold text-emerald-600">${supplierKeeps.toFixed(2)}</span>
                <p className="text-xs text-slate-500 mt-0.5">You keep</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="modal-approval-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
              Notes <span className="text-slate-400 font-normal">(required for decline)</span>
            </label>
            <textarea
              id="modal-approval-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any notes or reason for declining..."
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={() => handleAction('reject')}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Decline
          </button>
          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
