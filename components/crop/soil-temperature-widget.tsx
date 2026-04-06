'use client';

import { useEffect, useState } from 'react';
import { Thermometer, Wind, Droplets, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Clock, CloudRain } from 'lucide-react';

interface SoilTemperatureData {
  current_f: number;
  forecast_daily_f: number[];
  trend: 'warming' | 'cooling' | 'stable';
  timestamp: string;
}

interface PlantingReadiness {
  status: 'optimal' | 'marginal' | 'too_cold' | 'too_hot';
  message: string;
  min_threshold_f: number;
  optimal_range_f: [number, number];
  days_until_ready: number | null;
}

interface SprayWindow {
  date: string;
  label: string;
  conditions: 'excellent' | 'good' | 'marginal' | 'poor';
  avg_temp_f: number;
  avg_humidity: number;
  max_wind_mph: number;
  total_precip_in: number;
}

interface WeatherContext {
  spray_windows: SprayWindow[];
  gdd_projected_7d: number;
  precip_7d_in: number;
  summary: string;
}

interface EnvironmentalData {
  soil_temperature: SoilTemperatureData;
  weather: WeatherContext;
  planting_readiness: PlantingReadiness | null;
  resolved_coords?: { lat: number; lng: number };
}

interface SoilTemperatureWidgetProps {
  /** Provide either lat+lng or a zip code */
  latitude?: number;
  longitude?: number;
  zip?: string;
  cropType?: string;
  /** Called when data loads with resolved lat/lng (useful when zip was provided) */
  onDataLoaded?: (lat: number, lng: number) => void;
}

const STATUS_CONFIG = {
  optimal: {
    bg: 'bg-emerald-50 border-emerald-200',
    icon: <CheckCircle className="h-4 w-4 text-emerald-600" />,
    label: 'Optimal',
    labelColor: 'text-emerald-700',
    tempColor: 'text-emerald-700',
  },
  marginal: {
    bg: 'bg-amber-50 border-amber-200',
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    label: 'Marginal',
    labelColor: 'text-amber-700',
    tempColor: 'text-amber-700',
  },
  too_cold: {
    bg: 'bg-blue-50 border-blue-200',
    icon: <AlertTriangle className="h-4 w-4 text-blue-600" />,
    label: 'Too Cold',
    labelColor: 'text-blue-700',
    tempColor: 'text-blue-700',
  },
  too_hot: {
    bg: 'bg-red-50 border-red-200',
    icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
    label: 'Too Hot',
    labelColor: 'text-red-700',
    tempColor: 'text-red-700',
  },
};

const CONDITIONS_CONFIG = {
  excellent: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  good: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  marginal: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  poor: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
};

export function SoilTemperatureWidget({
  latitude,
  longitude,
  zip,
  cropType,
  onDataLoaded,
}: SoilTemperatureWidgetProps) {
  const [data, setData] = useState<EnvironmentalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const hasLatLng = latitude !== undefined && longitude !== undefined && latitude !== 0 && longitude !== 0;
    const hasZip = zip && zip.length === 5;
    if (!hasLatLng && !hasZip) return;

    const params = new URLSearchParams();
    if (hasLatLng) {
      params.set('lat', latitude!.toString());
      params.set('lng', longitude!.toString());
    } else {
      params.set('zip', zip!);
    }
    if (cropType) params.set('crop', cropType);

    setLoading(true);
    setError('');

    fetch(`/api/crop/soil-temperature?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load environmental data');
        return res.json();
      })
      .then((json: EnvironmentalData) => {
        setData(json);
        const resolvedLat = json.resolved_coords?.lat ?? latitude ?? 0;
        const resolvedLng = json.resolved_coords?.lng ?? longitude ?? 0;
        if (resolvedLat !== 0 && resolvedLng !== 0) {
          onDataLoaded?.(resolvedLat, resolvedLng);
        }
      })
      .catch(() => {
        setError('Unable to load field conditions. Environmental data is optional.');
      })
      .finally(() => setLoading(false));
  }, [latitude, longitude, zip, cropType, onDataLoaded]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-white p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 w-40 rounded bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error || 'Environmental data unavailable for this location.'}</span>
        </div>
      </div>
    );
  }

  const { soil_temperature: soilTemp, weather, planting_readiness: readiness } = data;
  const statusCfg = readiness ? STATUS_CONFIG[readiness.status] : null;

  const TrendIcon =
    soilTemp.trend === 'warming'
      ? TrendingUp
      : soilTemp.trend === 'cooling'
      ? TrendingDown
      : Minus;

  const trendColor =
    soilTemp.trend === 'warming'
      ? 'text-orange-500'
      : soilTemp.trend === 'cooling'
      ? 'text-blue-500'
      : 'text-slate-400';

  const goodWindows = weather.spray_windows.filter(
    (w) => w.conditions === 'excellent' || w.conditions === 'good'
  );

  return (
    <div className="space-y-3">
      {/* Soil Temperature Card */}
      <div
        className={`rounded-xl border p-4 ${statusCfg?.bg ?? 'bg-slate-50 border-slate-200'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700">
              Soil Temperature (Seed Zone)
            </span>
          </div>
          {statusCfg && (
            <div className={`flex items-center gap-1 text-xs font-bold ${statusCfg.labelColor}`}>
              {statusCfg.icon}
              {statusCfg.label}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-end gap-3">
          <div className={`text-3xl font-extrabold ${statusCfg?.tempColor ?? 'text-slate-900'}`}>
            {soilTemp.current_f}°F
          </div>
          <div className={`flex items-center gap-1 text-sm font-medium pb-0.5 ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span className="capitalize">{soilTemp.trend}</span>
          </div>
        </div>

        {readiness && (
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            {readiness.message}
          </p>
        )}

        {readiness?.days_until_ready !== null && readiness?.days_until_ready !== undefined && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-700 font-medium">
            <Clock className="h-3.5 w-3.5" />
            Projected ready in ~{readiness.days_until_ready} day{readiness.days_until_ready !== 1 ? 's' : ''}
          </div>
        )}

        {/* 7-day forecast bar */}
        {soilTemp.forecast_daily_f.length > 0 && readiness && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1.5">7-day soil temp forecast</p>
            <div className="flex gap-1">
              {soilTemp.forecast_daily_f.slice(0, 7).map((temp, i) => {
                const isOptimal =
                  temp >= readiness.optimal_range_f[0] &&
                  temp <= readiness.optimal_range_f[1];
                const isAboveMin = temp >= readiness.min_threshold_f;
                const barColor = isOptimal
                  ? 'bg-emerald-400'
                  : isAboveMin
                  ? 'bg-amber-400'
                  : 'bg-blue-300';
                const dayLabel = ['T', 'M', 'T', 'W', 'T', 'F', 'S', 'S'][
                  (new Date().getDay() + i) % 7
                ];
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-400">{dayLabel}</span>
                    <div
                      className={`w-full rounded-sm ${barColor}`}
                      style={{ height: `${Math.max(8, Math.min(32, (temp - 30) * 0.8))}px` }}
                      title={`${temp}°F`}
                    />
                    <span className="text-xs text-slate-500">{temp}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Spray Windows Card */}
      {goodWindows.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wind className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">
              Upcoming Spray Windows
            </span>
          </div>
          <div className="space-y-2">
            {goodWindows.slice(0, 3).map((window, i) => {
              const cfg = CONDITIONS_CONFIG[window.conditions];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-xs text-slate-700 truncate">{window.label}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                      {window.conditions.charAt(0).toUpperCase() + window.conditions.slice(1)}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Thermometer className="h-3 w-3" />
                      {window.avg_temp_f}°F
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Wind className="h-3 w-3" />
                      {window.max_wind_mph}mph
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weather Summary Row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-white px-3 py-2.5 flex items-center gap-2">
          <CloudRain className="h-4 w-4 text-blue-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">7-day precip</p>
            <p className="text-sm font-bold text-slate-800">{weather.precip_7d_in}&quot;</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-white px-3 py-2.5 flex items-center gap-2">
          <Droplets className="h-4 w-4 text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">GDD (next 7d)</p>
            <p className="text-sm font-bold text-slate-800">{weather.gdd_projected_7d}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
