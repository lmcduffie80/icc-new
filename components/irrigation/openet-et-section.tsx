'use client';

import { useEffect, useState } from 'react';
import { Droplets, Loader2, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ETDataPoint {
  time: string; // "YYYY-MM"
  et: number;
}

interface ETTimeseries {
  points: ETDataPoint[];
  units: 'in' | 'mm';
  model: string;
  fetchedAt: string;
}

interface OpenETSectionProps {
  lat: number;
  lng: number;
  locationLabel: string;
}

// Month abbreviations for the X-axis labels
const MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(time: string): string {
  const [, mm] = time.split('-');
  return MONTH_ABBRS[parseInt(mm, 10) - 1] ?? time;
}

/**
 * Minimal inline bar chart — no charting library required.
 * Each bar is a flex column with a CSS-height percentage of the max value.
 */
function ETBarChart({ points, units }: { points: ETDataPoint[]; units: string }) {
  const maxEt = Math.max(...points.map((p) => p.et), 0.01);
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  return (
    <div className="mt-3">
      {/* Bars */}
      <div className="flex items-end gap-0.5 h-28">
        {points.map((p) => {
          const pct = Math.max(4, (p.et / maxEt) * 100);
          const isCurrent = p.time === currentMonth;
          return (
            <div
              key={p.time}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${monthLabel(p.time)}: ${p.et.toFixed(2)} ${units}`}
            >
              {/* Bar */}
              <div
                className={`w-full rounded-t-sm transition-all ${
                  isCurrent
                    ? 'bg-emerald-500'
                    : 'bg-emerald-200 group-hover:bg-emerald-400'
                }`}
                style={{ height: `${pct}%` }}
              />
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10">
                <div className="rounded bg-slate-800 px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-lg">
                  {monthLabel(p.time)}: {p.et.toFixed(2)} {units}
                </div>
                <div className="h-1.5 w-1.5 rotate-45 bg-slate-800 -mt-0.5" />
              </div>
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex items-start gap-0.5 mt-1">
        {points.map((p) => (
          <div key={p.time} className="flex-1 text-center text-[9px] text-muted-foreground leading-tight">
            {monthLabel(p.time)}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBadge({ points }: { points: ETDataPoint[] }) {
  if (points.length < 2) return null;
  const last = points[points.length - 1].et;
  const prev = points[points.length - 2].et;
  const delta = last - prev;
  const pct = prev > 0 ? Math.abs(delta / prev) * 100 : 0;

  if (pct < 5) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
        <Minus className="h-3 w-3" /> Stable
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
        <TrendingUp className="h-3 w-3" /> +{pct.toFixed(0)}% vs prev
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
      <TrendingDown className="h-3 w-3" /> -{pct.toFixed(0)}% vs prev
    </span>
  );
}

/**
 * Satellite-based Evapotranspiration (ET) widget powered by the OpenET
 * Ensemble model. Fetches 12 months of ET data for the farmer's location
 * and renders an inline bar chart showing monthly water use.
 */
export function OpenETSection({ lat, lng, locationLabel }: OpenETSectionProps) {
  const [data, setData] = useState<ETTimeseries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setUnavailable(false);
    setData(null);

    fetch(`/api/public/openet-et?lat=${lat}&lng=${lng}&months=12&units=in`)
      .then(async (res) => {
        if (res.status === 503) {
          // OpenET not configured — hide the section gracefully
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json() as ETTimeseries;
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load ET data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  // Silently hide when OpenET is not configured for this installation
  if (unavailable) return null;

  const latestPoint = data?.points.at(-1) ?? null;
  const units = data?.units ?? 'in';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Droplets className="h-4 w-4 text-sky-600" />
          Satellite ET — Monthly Water Use
          {latestPoint && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
              {monthLabel(latestPoint.time)}: {latestPoint.et.toFixed(2)}&quot;
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Actual crop water use (ET) at {locationLabel} — satellite-derived, 12-month view
        </p>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex h-36 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
          </div>
        )}

        {error && !loading && (
          <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-slate-50 text-center text-sm text-muted-foreground">
            <Info className="h-5 w-5 opacity-40" />
            <p>{error}</p>
          </div>
        )}

        {data && data.points.length > 0 && (
          <>
            {/* Summary row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <span className="text-3xl font-bold tabular-nums text-sky-700">
                  {latestPoint?.et.toFixed(2)}
                </span>
                <span className="ml-1 text-sm text-muted-foreground">{units} / month</span>
              </div>
              <TrendBadge points={data.points} />
            </div>

            <ETBarChart points={data.points} units={units} />

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground leading-relaxed">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                Current month
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200" />
                Past months
              </span>
              <span className="ml-auto">
                OpenET Ensemble · gridMET ref · {data.units === 'in' ? 'inches' : 'millimeters'}
              </span>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
              ET values are satellite-derived using the OpenET Ensemble model. Use monthly totals
              to compare actual crop water use against your irrigation records and refine scheduling.
            </p>
          </>
        )}

        {data && data.points.length === 0 && !loading && (
          <div className="flex h-36 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Info className="h-5 w-5 opacity-40" />
            <p>No ET data available for this location yet. OpenET coverage may be limited here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
