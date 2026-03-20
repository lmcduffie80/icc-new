'use client';

import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function SupplierDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-slate-900">
          Something went wrong
        </h2>
        <p className="mb-6 text-slate-500">
          We encountered an unexpected error loading this page. This is usually
          temporary — please try again.
        </p>
        {error.digest && (
          <p className="mb-4 text-xs text-slate-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 hover:cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/supplier/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:cursor-pointer"
          >
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
