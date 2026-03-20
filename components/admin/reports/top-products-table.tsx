'use client';

import { TopProduct } from '@/types/reports';
import Image from 'next/image';
import Link from 'next/link';
import { Package, TrendingUp, Users, DollarSign } from 'lucide-react';

interface TopProductsTableProps {
  products: TopProduct[];
  loading?: boolean;
}

const formatCurrency = (amount: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(amount)
  );

const formatNumber = (num: string) =>
  new Intl.NumberFormat('en-US').format(parseInt(num));

// Helper to convert S3 URLs to proxied URLs
const getProxiedImageUrl = (imageUrl: string | null): string | null => {
  if (!imageUrl) return null;
  // If it's an S3 URL, proxy it through our API
  if (imageUrl.includes('amazonaws.com') || imageUrl.includes('s3')) {
    return `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;
  }
  // Otherwise return as-is (for external URLs like unsplash)
  return imageUrl;
};

export function TopProductsTable({ products, loading }: TopProductsTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-4">
              <div className="h-16 w-16 bg-slate-200 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <Package className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">No Products Found</h3>
        <p className="mt-2 text-sm text-slate-500">
          No products were purchased during the selected time period.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Top 5 Products by Revenue</h2>
        <p className="mt-1 text-sm text-slate-500">
          Best-selling products with supplier attribution
        </p>
      </div>

      {/* Desktop View - Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Supplier
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Quantity Sold
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Revenue
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Customers
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Avg Order Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.map((product, index) => (
              <tr key={product.product_id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-sm">
                    {index + 1}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {getProxiedImageUrl(product.image) ? (
                        <Image
                          src={getProxiedImageUrl(product.image)!}
                          alt={product.product_name}
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/admin/products/${product.product_id}`}
                        className="font-medium text-slate-900 hover:text-emerald-600"
                      >
                        {product.product_name}
                      </Link>
                      <p className="text-sm text-slate-500">{product.category}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {product.supplier_id ? (
                    <div>
                      <p className="font-medium text-slate-900">{product.supplier_name}</p>
                      {product.supplier_contact && (
                        <p className="text-sm text-slate-500">{product.supplier_contact}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic">ICC Direct</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <span className="font-medium text-slate-900">
                    {formatNumber(product.total_quantity)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <span className="font-semibold text-emerald-600">
                    {formatCurrency(product.total_revenue)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <span className="font-medium text-slate-900">
                    {formatNumber(product.unique_customers)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <span className="font-medium text-slate-900">
                    {formatCurrency(product.avg_order_value)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View - Cards */}
      <div className="lg:hidden divide-y divide-slate-200">
        {products.map((product, index) => (
          <div key={product.product_id} className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-sm flex-shrink-0">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                {/* Product Info */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {getProxiedImageUrl(product.image) ? (
                      <Image
                        src={getProxiedImageUrl(product.image)!}
                        alt={product.product_name}
                        fill
                        sizes="48px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-6 w-6 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/products/${product.product_id}`}
                      className="font-medium text-slate-900 hover:text-emerald-600 block truncate"
                    >
                      {product.product_name}
                    </Link>
                    <p className="text-sm text-slate-500">{product.category}</p>
                  </div>
                </div>

                {/* Supplier Info */}
                <div className="mb-3 pb-3 border-b border-slate-100">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Supplier</p>
                  {product.supplier_id ? (
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{product.supplier_name}</p>
                      {product.supplier_contact && (
                        <p className="text-sm text-slate-500">{product.supplier_contact}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic">ICC Direct</span>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Quantity</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatNumber(product.total_quantity)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-xs text-slate-500">Revenue</p>
                      <p className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(product.total_revenue)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Customers</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatNumber(product.unique_customers)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Avg Order</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(product.avg_order_value)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
