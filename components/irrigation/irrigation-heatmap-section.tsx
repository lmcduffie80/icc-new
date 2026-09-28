'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Info, ZoomIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseJsonResponse } from '@/lib/fetch-json';
import { IRRIGATION_CATEGORY_INFO, type IrrigationGrid } from '@/lib/irrigation';

const IrrigationHeatmapMap = dynamic(
  () => import('./irrigation-heatmap-map').then((m) => m.IrrigationHeatmapMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-border/60 bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    ),
  }
);

interface IrrigationHeatmapSectionProps {
  lat: number;
  lng: number;
  locationLabel: string;
}

/**
 * Zoomable, field-level irrigation-need heatmap for the Soil Intelligence
 * page. Reuses the location the farmer already provided above (via
 * geolocation or ZIP) — no second "use my location" prompt needed.
 */
export function IrrigationHeatmapSection({ lat, lng, locationLabel }: IrrigationHeatmapSectionProps) {
  const [grid, setGrid] = useState<IrrigationGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setGrid(null);

    fetch(`/api/public/irrigation-heatmap?lat=${lat}&lng=${lng}`)
      .then((res) => parseJsonResponse<IrrigationGrid>(res))
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setGrid(result.data);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load the irrigation heatmap. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ZoomIn className="h-4 w-4 text-emerald-600" />
          Zoom Into Your Field — Irrigation Heatmap
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          A ~6-mile area around {locationLabel}. Pan and zoom the map to find your field, then use
          the colored overlay to see where irrigation is most needed.
        </p>
      </CardHeader>
      <CardContent>
        {loading && !grid && (
          <div className="flex h-[420px] items-center justify-center rounded-xl border border-border/60 bg-slate-50">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        )}
        {error && !grid && !loading && (
          <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-slate-50 text-center text-sm text-muted-foreground">
            <Info className="h-6 w-6 opacity-40" />
            <p>{error}</p>
          </div>
        )}
        {grid && (
          <>
            <IrrigationHeatmapMap grid={grid} />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {Object.values(IRRIGATION_CATEGORY_INFO).map((info) => (
                <span key={info.label} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: info.color }}
                  />
                  {info.label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Estimated from public weather-model soil moisture and 7-day rainfall vs. reference
              evapotranspiration. This is a planning aid, not a substitute for in-field soil
              moisture sensors.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
