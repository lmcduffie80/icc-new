'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { VegetationStats } from '@/lib/sentinel-hub';

interface VegetationHistoryChartProps {
  stats: VegetationStats[];
}

/**
 * Line chart showing NDWI (water index) and NDVI (crop health) over time,
 * sourced from the Sentinel Hub Statistical API via our server-side route.
 *
 * NDWI > 0 → good moisture; NDWI < −0.3 → severe drought stress.
 * NDVI > 0.5 → dense healthy canopy; NDVI < 0.3 → sparse or stressed.
 */
export function VegetationHistoryChart({ stats }: VegetationHistoryChartProps) {
  const [activeIndex, setActiveIndex] = useState<string | null>(null);

  const data = useMemo(() => {
    return [...stats]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((s) => ({
        date: new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ndwi:    s.ndwi    ? Math.round(s.ndwi.mean    * 1000) / 1000 : null,
        ndwiMax: s.ndwi    ? Math.round(s.ndwi.max     * 1000) / 1000 : null,
        ndwiMin: s.ndwi    ? Math.round(s.ndwi.min     * 1000) / 1000 : null,
        ndvi:    s.ndvi    ? Math.round(s.ndvi.mean    * 1000) / 1000 : null,
        ndviMax: s.ndvi    ? Math.round(s.ndvi.max     * 1000) / 1000 : null,
        ndviMin: s.ndvi    ? Math.round(s.ndvi.min     * 1000) / 1000 : null,
      }));
  }, [stats]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-xl border border-border/60 bg-muted/30 text-sm text-muted-foreground">
        No vegetation history data available yet.
      </div>
    );
  }

  const handleLegendClick = (key: string) => {
    setActiveIndex((prev) => (prev === key ? null : key));
  };

  const lineOpacity = (key: string) =>
    activeIndex === null || activeIndex === key ? 1 : 0.2;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div>
        <p className="text-sm font-medium">Vegetation &amp; Water Index — 90-Day Trend</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <strong>NDWI</strong>: above 0 = well-watered · below −0.3 = drought stress.{' '}
          <strong>NDVI</strong>: above 0.5 = healthy canopy · below 0.3 = sparse/stressed.
          Click a legend item to isolate it.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[-0.5, 1]}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                ndwi: 'NDWI mean', ndwiMax: 'NDWI max', ndwiMin: 'NDWI min',
                ndvi: 'NDVI mean', ndviMax: 'NDVI max', ndviMin: 'NDVI min',
              };
              return [value?.toFixed(3) ?? '—', labels[name] ?? name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
            onClick={(e) => handleLegendClick(e.dataKey as string)}
            formatter={(value) => {
              const labels: Record<string, string> = {
                ndwi: 'NDWI mean', ndvi: 'NDVI mean',
              };
              return labels[value] ?? value;
            }}
          />

          {/* Reference lines */}
          <ReferenceLine y={0}    stroke="#94a3b8" strokeDasharray="3 2" />
          <ReferenceLine y={0.3}  stroke="#f59e0b" strokeDasharray="4 2"
            label={{ value: 'NDVI low', fontSize: 10, fill: '#f59e0b', position: 'right' }} />
          <ReferenceLine y={-0.3} stroke="#ef4444" strokeDasharray="4 2"
            label={{ value: 'Drought', fontSize: 10, fill: '#ef4444', position: 'right' }} />

          {/* NDWI — blue tones */}
          <Line type="monotone" dataKey="ndwiMax" stroke="#93c5fd" strokeWidth={1}
            dot={false} strokeDasharray="4 2" connectNulls legendType="none"
            strokeOpacity={lineOpacity('ndwi')} />
          <Line type="monotone" dataKey="ndwi" stroke="#2563eb" strokeWidth={2.5}
            dot={{ r: 3, fill: '#2563eb' }} activeDot={{ r: 5 }} connectNulls
            strokeOpacity={lineOpacity('ndwi')} />
          <Line type="monotone" dataKey="ndwiMin" stroke="#bfdbfe" strokeWidth={1}
            dot={false} strokeDasharray="4 2" connectNulls legendType="none"
            strokeOpacity={lineOpacity('ndwi')} />

          {/* NDVI — green tones */}
          <Line type="monotone" dataKey="ndviMax" stroke="#86efac" strokeWidth={1}
            dot={false} strokeDasharray="4 2" connectNulls legendType="none"
            strokeOpacity={lineOpacity('ndvi')} />
          <Line type="monotone" dataKey="ndvi" stroke="#16a34a" strokeWidth={2.5}
            dot={{ r: 3, fill: '#16a34a' }} activeDot={{ r: 5 }} connectNulls
            strokeOpacity={lineOpacity('ndvi')} />
          <Line type="monotone" dataKey="ndviMin" stroke="#bbf7d0" strokeWidth={1}
            dot={false} strokeDasharray="4 2" connectNulls legendType="none"
            strokeOpacity={lineOpacity('ndvi')} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
