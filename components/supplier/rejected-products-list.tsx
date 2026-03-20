'use client';

import { useState, useEffect } from 'react';
import { XCircle, Loader2, AlertCircle, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface RejectedProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  supplier_price: string | null;
  sku: string | null;
  unit_of_measure: string | null;
  image: string | null;
  approval_status: string;
  approval_notes: string | null;
  icc_available_quantity: number;
  label_url: string | null;
  sds_url: string | null;
  created_at: string;
  updated_at: string;
}

export function RejectedProductsList() {
  const [products, setProducts] = useState<RejectedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRejectedProducts() {
      try {
        const response = await fetch('/api/supplier/products/rejected');
        if (!response.ok) {
          throw new Error('Failed to fetch rejected products');
        }
        const data = await response.json();
        setProducts(data.products || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load rejected products');
      } finally {
        setLoading(false);
      }
    }

    fetchRejectedProducts();
  }, []);

  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(productId);
    try {
      const response = await fetch(`/api/supplier/products/${productId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete product');
      }

      // Remove product from list
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setDeleting(null);
    }
  };

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

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <XCircle className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">No Rejected Products</h3>
        <p className="mt-2 text-sm text-slate-500">
          All your products have been approved or are pending review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {products.map((product) => (
        <div
          key={product.id}
          className="rounded-lg border border-red-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  {product.name}
                </h3>
                <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                  Rejected
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {product.category} • Rejected on {new Date(product.updated_at).toLocaleDateString()}
              </p>

              {product.approval_notes && (
                <div className="mt-3 rounded-md bg-red-50 p-3 border border-red-200">
                  <p className="text-sm font-medium text-red-900">Rejection Reason:</p>
                  <p className="mt-1 text-sm text-red-700">{product.approval_notes}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
                <span>Price: ${parseFloat(product.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {product.icc_available_quantity !== null && (
                  <span>ICC Qty: {product.icc_available_quantity}</span>
                )}
                {product.sku && (
                  <span>SKU: {product.sku}</span>
                )}
              </div>
            </div>

            <div className="ml-4 flex gap-2">
              <Link
                href={`/supplier/products/${product.id}`}
                className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <Edit className="h-4 w-4" />
                Edit Product
              </Link>
              <button
                onClick={() => handleDelete(product.id, product.name)}
                disabled={deleting === product.id}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting === product.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

