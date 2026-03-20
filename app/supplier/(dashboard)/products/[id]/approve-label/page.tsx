'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ApproveLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [productId, setProductId] = useState<string | null>(null);

  useEffect(() => {
    async function handleApproval() {
      const token = searchParams.get('token');
      const resolvedParams = await params;
      const id = resolvedParams.id;

      if (!token) {
        setStatus('error');
        setMessage('Missing approval token');
        setLoading(false);
        return;
      }

      setProductId(id);

      try {
        const response = await fetch(`/api/supplier/products/${id}/approve-label`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'approve' }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to approve label');
        }

        setStatus('success');
        setMessage(data.message || 'Label approved successfully!');
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to approve label');
      } finally {
        setLoading(false);
      }
    }

    handleApproval();
  }, [searchParams, params]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-green-600" />
          <p className="mt-4 text-slate-600">Processing approval...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
        {status === 'success' ? (
          <>
            <div className="text-center">
              <CheckCircle className="mx-auto h-16 w-16 text-green-600" />
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Label Approved</h1>
              <p className="mt-2 text-slate-600">{message}</p>
              <p className="mt-4 text-sm text-slate-500">
                Your product has been published and is now available on the store.
              </p>
            </div>
            <div className="mt-8 flex flex-col space-y-3">
              {productId && (
                <Link
                  href={`/supplier/products/${productId}`}
                  className="rounded-md bg-green-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-green-700"
                >
                  View Product
                </Link>
              )}
              <Link
                href="/supplier/products"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Products
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="text-center">
              <XCircle className="mx-auto h-16 w-16 text-red-600" />
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Approval Failed</h1>
              <p className="mt-2 text-slate-600">{message}</p>
            </div>
            <div className="mt-8 flex flex-col space-y-3">
              <Link
                href="/supplier/products"
                className="rounded-md bg-green-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-green-700"
              >
                Back to Products
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

