'use client';

import Link from 'next/link';
import { AlertCircle, X } from 'lucide-react';
import { useState } from 'react';

export function PastDueBanner({ tenantSlug }: { tenantSlug: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative bg-amber-500 px-4 py-2.5 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            Your payment failed.{' '}
            <Link
              href={`/${tenantSlug}/billing`}
              className="font-semibold underline hover:no-underline"
            >
              Update your billing
            </Link>{' '}
            to avoid interruption.
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-0.5 hover:bg-amber-600 hover:cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
