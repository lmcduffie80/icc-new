'use client';

import { DollarSign, AlertCircle } from 'lucide-react';
import { getGallonsFromContainerSize } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  price: string;
  original_price?: string | null;
  margin_split_percentage?: string | null;
  margin_approval_status?: string;
  supplier_margin_approval_status?: string | null;
  admin_proposed_margin_percent?: string | null;
  margin_proposal_source?: string | null;
  attributes?: {
    containerSizes?: string;
  } | null;
}

interface MarginManagementTableProps {
  product: Product;
  hasGallonPricing: boolean;
  containerSizes?: string;
  currentPrice?: string;
  currentOriginalPrice?: string;
  marginPercent: string;
  onMarginPercentChange: (value: string) => void;
  marginNotes: string;
  onMarginNotesChange: (value: string) => void;
}

export function MarginManagementTable({
  product,
  hasGallonPricing,
  containerSizes,
  currentPrice,
  currentOriginalPrice,
  marginPercent,
  onMarginPercentChange,
  marginNotes,
  onMarginNotesChange,
}: MarginManagementTableProps) {
  // Calculate values - use current form values if provided, otherwise fall back to product values
  const storePrice = parseFloat(currentPrice || product.price) || 0;
  const supplierPrice = parseFloat(currentOriginalPrice || product.original_price || '0') || 0;
  const totalMargin = storePrice - supplierPrice;

  // Get gallons for container
  const gallons = hasGallonPricing && containerSizes
    ? getGallonsFromContainerSize(containerSizes)
    : 0;

  const storePricePerGallon = hasGallonPricing && gallons !== null && gallons > 0
    ? storePrice / gallons
    : storePrice;

  const supplierPricePerGallon = hasGallonPricing && gallons !== null && gallons > 0
    ? supplierPrice / gallons
    : supplierPrice;

  // Calculate preview values
  const marginPercentNum = parseFloat(marginPercent) || 0;
  const platformShare = totalMargin * (marginPercentNum / 100);
  const supplierKeeps = totalMargin - platformShare;

  // Check if there's a pending admin proposal
  const hasPendingProposal = product.margin_proposal_source === 'admin' &&
    product.supplier_margin_approval_status === 'pending';

  return (
    <div className="space-y-6">
      {hasPendingProposal && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Margin Approval Pending</p>
              <p className="text-sm text-yellow-700 mt-1">
                Your proposed margin of {product.admin_proposed_margin_percent}% is awaiting supplier approval.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Price Display */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Store Price */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-2">Managed by administrators</div>
          <div className="mb-3">
            <div className="text-xs font-medium text-slate-600 uppercase mb-1">
              {hasGallonPricing ? 'STORE PRICE PER GALLON' : 'STORE PRICE'}
            </div>
            <div className="text-2xl font-bold text-green-600">
              ${hasGallonPricing ? storePricePerGallon.toFixed(4) : storePrice.toFixed(2)}/{hasGallonPricing ? 'gal' : 'unit'}
            </div>
          </div>
          {hasGallonPricing && (
            <>
              <div className="text-sm text-slate-600 mb-1">
                Container: {containerSizes || 'N/A'} ({gallons} gallons)
              </div>
              <div className="pt-2 border-t border-slate-200">
                <div className="text-xs text-slate-500 uppercase">TOTAL STORE PRICE:</div>
                <div className="text-lg font-semibold text-slate-900">${storePrice.toFixed(2)}</div>
                <div className="text-xs text-slate-500">Informational only</div>
              </div>
            </>
          )}
        </div>

        {/* Supplier Price */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-2">Managed by administrators</div>
          <div className="mb-3">
            <div className="text-xs font-medium text-slate-600 uppercase mb-1">
              {hasGallonPricing ? 'YOUR PRICE PER GALLON' : 'SUPPLIER PRICE'}
            </div>
            <div className="text-2xl font-bold text-green-600">
              ${hasGallonPricing ? supplierPricePerGallon.toFixed(4) : supplierPrice.toFixed(2)}/{hasGallonPricing ? 'gal' : 'unit'}
            </div>
          </div>
          {hasGallonPricing && (
            <>
              <div className="text-sm text-slate-600 mb-1">
                Container: {containerSizes || 'N/A'} ({gallons} gallons)
              </div>
              <div className="pt-2 border-t border-slate-200">
                <div className="text-xs text-slate-500 uppercase">TOTAL SUPPLIER PRICE:</div>
                <div className="text-lg font-semibold text-slate-900">${supplierPrice.toFixed(2)}</div>
                <div className="text-xs text-slate-500">Informational only</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Margin Split with Platform */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Margin Split with Platform</h3>

        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Margin: Pending
          </span>
        </div>

        <div className="mb-4">
          <label htmlFor="margin-percent" className="block text-sm font-medium text-slate-700 mb-1">
            Margin Split Percentage
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              id="margin-percent"
              min="0"
              max="100"
              step="0.01"
              value={marginPercent}
              onChange={(e) => onMarginPercentChange(e.target.value)}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-center focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <span className="text-sm text-slate-600">%</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            This margin proposal will be sent to the supplier when you save the product.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="margin-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes for Supplier (Optional)
          </label>
          <textarea
            id="margin-notes"
            rows={3}
            value={marginNotes}
            onChange={(e) => onMarginNotesChange(e.target.value)}
            placeholder="Add any notes for the supplier about this margin change..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Margin Preview */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Margin Preview (per unit)
        </h3>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Store Price:</span>
            <span className="font-semibold text-slate-900">${storePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Your Cost:</span>
            <span className="font-semibold text-slate-900">${supplierPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-slate-300 pt-2">
            <span className="text-slate-600">Margin:</span>
            <span className="font-semibold text-green-600">${totalMargin.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Platform Share ({marginPercentNum.toFixed(1)}%):</span>
            <span className="font-semibold text-slate-900">${platformShare.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-slate-300 pt-2">
            <span className="text-slate-700 font-medium">You Keep:</span>
            <span className="font-bold text-green-600 text-lg">${supplierKeeps.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
