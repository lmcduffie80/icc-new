'use client';

import { useEffect, useState } from 'react';
import { Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PassTarget {
  pass: string;
  timingLabel: string | null;
  targetDate: string;
  daysFromPlanting: number;
}

interface DeadlineResult {
  orderByDate: string;
  earliestTargetDate: string;
  message: string;
  passTargets: PassTarget[];
  leadTimeDays: number;
  urgency: 'asap' | 'soon' | 'normal' | 'ahead';
}

interface OrderByDeadlineProps {
  /** Use plan ID (requires auth, uses farm profile zip) */
  planId?: number;
  /** Use crop + zip (public, for acre-pack) */
  crop?: string;
  zip?: string;
  planYear?: number;
  /** Compact: single line. Full: expandable details */
  variant?: 'compact' | 'full';
  className?: string;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function OrderByDeadline({
  planId,
  crop,
  zip,
  planYear,
  variant = 'compact',
  className = '',
}: OrderByDeadlineProps) {
  const [result, setResult] = useState<DeadlineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!planId && !(crop && zip)) return;

    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (planId) params.set('planId', String(planId));
    if (crop) params.set('crop', crop);
    if (zip) params.set('zip', zip);
    if (planYear) params.set('year', String(planYear));

    fetch(`/api/crop/deadline?${params}`)
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error ?? d.hint ?? 'Failed')));
        return res.json();
      })
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [planId, crop, zip, planYear]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
        <span>Calculating order-by date…</span>
      </div>
    );
  }

  if (error || !result) {
    if (error?.includes('Location required') || error?.includes('Add your farm')) {
      return (
        <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 ${className}`}>
          <a href="/account/farm" className="font-medium underline hover:cursor-pointer">
            Add your farm ZIP
          </a>
          {' '}in Account → Farm Profile to see when to order.
        </div>
      );
    }
    return null;
  }

  const urgencyStyles = {
    asap: 'border-red-300 bg-red-50 text-red-800',
    soon: 'border-amber-300 bg-amber-50 text-amber-800',
    normal: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    ahead: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  const style = urgencyStyles[result.urgency];

  return (
    <div className={`rounded-xl border px-4 py-3 ${style} ${className}`}>
      <div className="flex items-start gap-3">
        {result.urgency === 'asap' ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
        ) : result.urgency === 'normal' || result.urgency === 'ahead' ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <Calendar className="h-5 w-5 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{result.message}</p>
          {variant === 'full' && result.passTargets.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 text-sm underline hover:no-underline hover:cursor-pointer"
            >
              {expanded ? 'Hide' : 'Show'} application targets
            </button>
          )}
          {variant === 'full' && expanded && (
            <ul className="mt-2 space-y-1 text-sm">
              {result.passTargets.map((p) => (
                <li key={p.pass} className="flex justify-between gap-4">
                  <span>{p.pass}</span>
                  <span className="text-slate-600">
                    Target: {formatShortDate(p.targetDate)}
                    {p.timingLabel && ` (${p.timingLabel})`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
