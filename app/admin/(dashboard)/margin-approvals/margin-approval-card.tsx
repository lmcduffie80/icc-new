'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Building2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { MarginApprovalActions } from './margin-approval-actions';
import { ModifyMarginButton } from './modify-margin-button';

interface Product {
  id: string;
  name: string;
  image: string | null;
  price: string;
  supplier_price: string;
  icc_margin_percent: string;
  icc_margin_amount: string;
  customer_margin_percent: string;
  customer_margin_amount: string;
  margin_approval_status: string;
  approval_status: string;
  supplier_name: string;
  created_at: string;
}

interface MarginApprovalCardProps {
  product: Product;
}

export function MarginApprovalCard({ product }: MarginApprovalCardProps) {
  const storePrice = parseFloat(product.price) || 0;
  const supplierPrice = parseFloat(product.supplier_price) || 0;
  const totalMargin = storePrice - supplierPrice;
  const iccMarginPercent = parseFloat(product.icc_margin_percent) || 0;
  const iccMarginAmount = parseFloat(product.icc_margin_amount) || 0;
  const customerMarginAmount = parseFloat(product.customer_margin_amount) || 0;
  const customerMarginPercent = parseFloat(product.customer_margin_percent) || 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4">
        {/* Header with Product Info */}
        <div className="flex items-start gap-3 mb-4">
          {/* Product Image */}
          <div className="flex-shrink-0">
            {product.image ? (
              <Image
                src={
                  product.image.includes('s3.amazonaws.com') || product.image.includes('.s3.')
                    ? `/api/images/proxy?url=${encodeURIComponent(product.image)}`
                    : product.image
                }
                alt={product.name}
                width={64}
                height={64}
                className="rounded-lg object-cover border border-slate-200"
                unoptimized
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                <DollarSign className="h-7 w-7 text-slate-400" />
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="flex-1 min-w-0">
            <Link
              href={`/admin/products/${product.id}`}
              className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition-colors"
            >
              {product.name}
            </Link>
            <div className="mt-1 flex items-center text-sm text-slate-500">
              <Building2 className="h-4 w-4 mr-1" />
              {product.supplier_name}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Requested: {new Date(product.created_at).toLocaleDateString()}
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex flex-col gap-2 items-end">
            {/* Margin Status Badge */}
            {product.margin_approval_status === 'pending' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Margin: Pending
              </span>
            )}
            {product.margin_approval_status === 'approved' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Margin: Approved
              </span>
            )}
            {product.margin_approval_status === 'rejected' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Margin: Rejected
              </span>
            )}
            
            {/* Product Status Badge (only show if not published) */}
            {product.approval_status && product.approval_status !== 'published' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Product: {product.approval_status}
              </span>
            )}
          </div>
        </div>

        {/* Pricing Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Store Price</p>
            <p className="mt-1 text-xl font-bold text-slate-900">${storePrice.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Supplier Cost</p>
            <p className="mt-1 text-xl font-bold text-slate-700">${supplierPrice.toFixed(2)}</p>
          </div>
        </div>

        {/* Margin Breakdown */}
        <div className="rounded-lg border border-slate-200 p-3 mb-4 space-y-2">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Margin Breakdown</h4>
          
          {/* Total Margin */}
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-700">Total Margin:</span>
            <span className="text-base font-bold text-slate-900">${totalMargin.toFixed(2)}</span>
          </div>

          {/* ICC Margin */}
          <div className="flex justify-between items-center bg-emerald-50 -mx-3 px-3 py-2 rounded">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <div>
                <span className="text-sm font-medium text-emerald-900">ICC Margin:</span>
                <span className="ml-2 text-xs text-emerald-700">({iccMarginPercent.toFixed(2)}%)</span>
              </div>
            </div>
            <span className="text-base font-bold text-emerald-700">${iccMarginAmount.toFixed(2)}</span>
          </div>

          {/* Customer Margin */}
          <div className="flex justify-between items-center bg-blue-50 -mx-3 px-3 py-2 rounded">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-600" />
              <div>
                <span className="text-sm font-medium text-blue-900">Customer Margin:</span>
                <span className="ml-2 text-xs text-blue-700">({customerMarginPercent.toFixed(2)}%)</span>
              </div>
            </div>
            <span className="text-base font-bold text-blue-700">${customerMarginAmount.toFixed(2)}</span>
          </div>

          {/* Validation Check */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Verification:</span>
              <span className={`font-medium ${Math.abs(iccMarginAmount + customerMarginAmount - totalMargin) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(iccMarginAmount + customerMarginAmount - totalMargin) < 0.01 ? '✓ Margins add up correctly' : '⚠ Margin calculation error'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {product.margin_approval_status === 'pending' && (
          <MarginApprovalActions productId={product.id} productName={product.name} />
        )}

        {product.margin_approval_status === 'approved' && (
          <div className="pt-4 border-t border-slate-200">
            <ModifyMarginButton
              productId={product.id}
              productName={product.name}
              currentIccMarginPercent={product.icc_margin_percent}
              storePrice={product.price}
              supplierPrice={product.supplier_price}
            />
          </div>
        )}
      </div>
    </div>
  );
}
