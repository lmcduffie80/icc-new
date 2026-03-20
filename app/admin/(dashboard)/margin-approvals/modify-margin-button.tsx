'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Loader2 } from 'lucide-react';

interface ModifyMarginButtonProps {
  productId: string;
  productName: string;
  currentIccMarginPercent: string;
  storePrice: string;
  supplierPrice: string;
}

export function ModifyMarginButton({
  productId,
  productName,
  currentIccMarginPercent,
  storePrice,
  supplierPrice,
}: ModifyMarginButtonProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [newMargin, setNewMargin] = useState(currentIccMarginPercent);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleModify = async () => {
    if (processing) return;

    const marginPercent = parseFloat(newMargin);
    if (isNaN(marginPercent) || marginPercent < 0 || marginPercent > 100) {
      setError('Please enter a valid percentage between 0 and 100');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to modify the ICC margin for "${productName}" from ${currentIccMarginPercent}% to ${marginPercent}%?\n\nThis will reset the approval status to 'pending' for re-review.`
    );

    if (!confirmed) return;

    setProcessing(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/products/${productId}/margin-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'modify',
          icc_margin_percent: marginPercent,
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to modify margin');
      }

      setShowModal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify margin');
    } finally {
      setProcessing(false);
    }
  };

  // Calculate preview
  const store = parseFloat(storePrice);
  const supplier = parseFloat(supplierPrice);
  const marginNum = parseFloat(newMargin) || 0;
  const totalMargin = store - supplier;
  const iccAmount = (totalMargin * marginNum) / 100;
  const supplierAmount = totalMargin - iccAmount;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
      >
        <Edit3 className="h-4 w-4" />
        <span>Modify Margin</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Modify ICC Margin</h3>
            
            <div className="space-y-4">
              {/* Current Margin */}
              <div className="bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500">Current ICC Margin</p>
                <p className="text-lg font-bold text-slate-900">{currentIccMarginPercent}%</p>
              </div>

              {/* New Margin Input */}
              <div>
                <label htmlFor="new-margin" className="block text-sm font-medium text-slate-700 mb-2">
                  New ICC Margin Percentage
                </label>
                <div className="relative">
                  <input
                    id="new-margin"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newMargin}
                    onChange={(e) => setNewMargin(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 pr-8 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-blue-50 rounded p-3 space-y-1 text-sm">
                <p className="font-medium text-slate-700">Preview:</p>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Margin:</span>
                  <span className="font-medium">${totalMargin.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">ICC Share ({marginNum.toFixed(1)}%):</span>
                  <span className="font-bold text-blue-700">${iccAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Supplier Share ({(100 - marginNum).toFixed(1)}%):</span>
                  <span className="font-bold text-purple-700">${supplierAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="modify-notes" className="block text-sm font-medium text-slate-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  id="modify-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  placeholder="Reason for modification..."
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={processing}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleModify}
                  disabled={processing}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Modifying...</span>
                    </>
                  ) : (
                    <span>Modify Margin</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
