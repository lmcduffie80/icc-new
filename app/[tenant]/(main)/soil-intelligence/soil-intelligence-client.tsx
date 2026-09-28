'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Loader2,
  AlertTriangle,
  Droplets,
  Thermometer,
  Wind,
  Search,
  Navigation,
  Satellite,
  RefreshCw,
  Info,
  CloudRain,
  TrendingUp,
} from 'lucide-react';
import { USMap } from '@/components/us-map';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IrrigationHeatmapSection } from '@/components/irrigation/irrigation-heatmap-section';
import { OpenETSection } from '@/components/irrigation/openet-et-section';
import type { SoilMoisture, MoistureCondition } from '@/lib/smap';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  lat: number;
  lng: number;
  zip: string | null;
  state_abbr: string;
  state_name: string;
  state_fips: string | null;
  city: string | null;
  county: string | null;
  label: string;
}

interface SoilTemperatureData {
  current_f: number;
  forecast_daily_f: number[];
  trend: 'warming' | 'cooling' | 'stable';
  timestamp: string;
}

interface PlantingReadiness {
  status: 'optimal' | 'marginal' | 'too_cold' | 'too_hot';
  message: string;
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

interface ConditionsData {
  location: Location;
  soil_temperature: SoilTemperatureData | null;
  soil_moisture: SoilMoisture | null;
  weather: WeatherContext | null;
  planting_readiness: PlantingReadiness | null;
}

// ─── Moisture condition helpers ───────────────────────────────────────────────

const CONDITION_CONFIG: Record<MoistureCondition, {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: string;
  desc: string;
}> = {
  drought:   { label: 'Drought',   bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     icon: '🔴', desc: 'Critically low moisture. Crops at severe stress risk.' },
  dry:       { label: 'Dry',       bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  icon: '🟠', desc: 'Below-normal moisture. Monitor crops closely.' },
  normal:    { label: 'Normal',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: '🟢', desc: 'Adequate moisture for most crops.' },
  moist:     { label: 'Moist',     bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: '🔵', desc: 'Above-normal moisture. Watch for disease pressure.' },
  saturated: { label: 'Saturated', bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  icon: '🟣', desc: 'Saturated soils. Tillage and planting may be delayed.' },
};

const TEMP_STATUS_CONFIG = {
  optimal:   { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Optimal for Planting' },
  marginal:  { bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   label: 'Marginal' },
  too_cold:  { bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700',    label: 'Too Cold' },
  too_hot:   { bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     label: 'Too Hot' },
};

const SPRAY_CONDITION_CONFIG = {
  excellent: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  good:      { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  marginal:  { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  poor:      { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MoistureMeter({ mean }: { mean: number }) {
  const pct = Math.min(100, Math.max(0, mean * 200)); // 0.5 m³/m³ = 100%
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Dry (0%)</span>
        <span>VWC: {(mean * 100).toFixed(1)}%</span>
        <span>Sat (50%+)</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-400 via-emerald-400 to-blue-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>0.0</span>
        <span>0.10</span>
        <span>0.20</span>
        <span>0.30</span>
        <span>0.40</span>
        <span>0.50+</span>
      </div>
    </div>
  );
}

function SoilMoistureCard({ moisture }: { moisture: SoilMoisture }) {
  const config = CONDITION_CONFIG[moisture.condition];
  return (
    <Card className={`border ${config.border} ${config.bg}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Droplets className={`h-4 w-4 ${config.text}`} />
          Soil Moisture
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.text} border-current`}>
            {config.icon} {config.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-2">
          <span className={`text-4xl font-bold tabular-nums ${config.text}`}>
            {(moisture.mean * 100).toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground mb-1">% VWC</span>
        </div>
        <MoistureMeter mean={moisture.mean} />
        <p className={`mt-3 text-xs ${config.text} leading-relaxed`}>{config.desc}</p>
        <p className="mt-2 text-[10px] text-muted-foreground">
          NASA SMAP satellite · {moisture.layerDate} · {moisture.fips ? `FIPS ${moisture.fips}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

function SoilTemperatureCard({
  soilTemp,
  readiness,
}: {
  soilTemp: SoilTemperatureData;
  readiness: PlantingReadiness | null;
}) {
  const statusCfg = readiness ? TEMP_STATUS_CONFIG[readiness.status] : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Thermometer className="h-4 w-4 text-amber-600" />
          Soil Temperature
          {readiness && statusCfg && (
            <span className={`ml-auto inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusCfg.text} border-current`}>
              {statusCfg.label}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-3">
          <span className="text-4xl font-bold tabular-nums text-amber-700">
            {soilTemp.current_f.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground mb-1">°F</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {soilTemp.trend === 'warming' ? '↑ Warming' : soilTemp.trend === 'cooling' ? '↓ Cooling' : '→ Stable'}
          </span>
        </div>
        {readiness && (
          <p className={`text-xs leading-relaxed ${statusCfg?.text ?? 'text-slate-600'}`}>
            {readiness.message}
            {readiness.days_until_ready && readiness.days_until_ready > 0 && (
              <span className="ml-1">({readiness.days_until_ready} days until ready)</span>
            )}
          </p>
        )}
        {/* Mini 7-day forecast bars */}
        {soilTemp.forecast_daily_f.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground mb-1">7-Day Forecast</p>
            <div className="flex items-end gap-1 h-10">
              {soilTemp.forecast_daily_f.slice(0, 7).map((t, i) => {
                const h = Math.min(100, Math.max(10, ((t - 32) / 68) * 100));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-t-sm bg-amber-300"
                      style={{ height: `${h}%` }}
                      title={`${t.toFixed(1)}°F`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SprayWindowCard({ weather }: { weather: WeatherContext }) {
  const todayWindow = weather.spray_windows[0];
  const cfg = todayWindow ? SPRAY_CONDITION_CONFIG[todayWindow.conditions] : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Wind className="h-4 w-4 text-sky-600" />
          Spray Conditions
          {cfg && todayWindow && (
            <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.text} border-current`}>
              <span className={`h-1.5 w-1.5 rounded-full inline-block ${cfg.dot}`} />
              {todayWindow.conditions.charAt(0).toUpperCase() + todayWindow.conditions.slice(1)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todayWindow ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div>
                <p className="text-lg font-bold text-slate-900">{todayWindow.avg_temp_f.toFixed(0)}°F</p>
                <p className="text-[10px] text-muted-foreground">Avg Temp</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{todayWindow.avg_humidity.toFixed(0)}%</p>
                <p className="text-[10px] text-muted-foreground">Humidity</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{todayWindow.max_wind_mph.toFixed(0)} mph</p>
                <p className="text-[10px] text-muted-foreground">Wind</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>{weather.gdd_projected_7d.toFixed(0)} GDD projected (7 days)</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <CloudRain className="h-3 w-3" />
              <span>{weather.precip_7d_in.toFixed(2)}&quot; precipitation (7 days)</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No spray window data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DroughtAlertStrip({ alerts }: { alerts: { state_abbr: string; state_name: string; mean: number; condition: MoistureCondition }[] }) {
  if (alerts.length === 0) return null;
  const hasDrought = alerts.some(a => a.condition === 'drought');
  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-start gap-3 ${
      hasDrought ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-center gap-2 shrink-0">
        <AlertTriangle className={`h-4 w-4 ${hasDrought ? 'text-red-600' : 'text-amber-600'}`} />
        <span className={`text-sm font-semibold ${hasDrought ? 'text-red-700' : 'text-amber-700'}`}>
          {hasDrought ? 'Drought Alert' : 'Dryness Advisory'} — Corn Belt
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {alerts.map(a => (
          <span
            key={a.state_abbr}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              a.condition === 'drought'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {a.state_name} · {(a.mean * 100).toFixed(0)}% VWC
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

interface SoilIntelligenceClientProps {
  /** Pre-fetched moisture map (server-side, keyed by state abbr) */
  initialMoistureMap: Record<string, SoilMoisture>;
  /** Corn Belt drought alerts */
  droughtAlerts: { state_abbr: string; state_name: string; mean: number; condition: MoistureCondition }[];
}

export function SoilIntelligenceClient({
  initialMoistureMap,
  droughtAlerts,
}: SoilIntelligenceClientProps) {
  const [zip, setZip] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [conditions, setConditions] = useState<ConditionsData | null>(null);
  const [error, setError] = useState('');
  const [highlightState, setHighlightState] = useState<string | undefined>(undefined);

  // Location for the irrigation heatmap — tracked separately from `conditions`
  // so the heatmap fetch can start in PARALLEL with the soil-conditions fetch
  // (as soon as we have coordinates) instead of waiting for the whole
  // conditions card list to finish loading first.
  const [heatmapLocation, setHeatmapLocation] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);

  // Full 48-state moisture map — starts with server-pre-fetched data, then upgrades
  // by fetching the cached API endpoint (avoids any SMAP latency for the user)
  const [moistureForMap, setMoistureForMap] = useState<Record<string, SoilMoisture>>(initialMoistureMap);
  const [mapLoading, setMapLoading] = useState(Object.keys(initialMoistureMap).length < 40);

  // Fetch full national map data client-side (the endpoint is cached 4 hrs server-side)
  useEffect(() => {
    fetch('/api/crop/soil-moisture-map')
      .then((r) => r.ok ? r.json() as Promise<{ states: Record<string, SoilMoisture> }> : Promise.reject())
      .then((data) => {
        if (data.states && Object.keys(data.states).length > 0) {
          setMoistureForMap(data.states);
        }
      })
      .catch(() => { /* use server-fetched data if endpoint fails */ })
      .finally(() => setMapLoading(false));
  }, []);

  const fetchConditions = useCallback(async (params: URLSearchParams) => {
    setDataLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/public/soil-conditions?${params}`);
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? 'Failed to fetch conditions');
      }
      const data = await res.json() as ConditionsData;
      setConditions(data);
      if (data.location.state_abbr) {
        setHighlightState(data.location.state_abbr);
      }
      // Refine the heatmap location with the server-resolved label (e.g. a
      // county/city name instead of a generic placeholder). For the
      // geolocation flow this reuses the exact same lat/lng already set
      // below in handleGeolocate, so no duplicate heatmap fetch is triggered.
      setHeatmapLocation({ lat: data.location.lat, lng: data.location.lng, label: data.location.label });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data. Please try again.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Your browser does not support geolocation. Please enter your ZIP code.');
      return;
    }
    setGeoLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoLoading(false);
        // Kick off the irrigation heatmap fetch immediately — we already
        // have coordinates, so there's no need to wait for the (slower)
        // soil-conditions fetch to resolve first. This runs in parallel
        // instead of as a second sequential wait.
        setHeatmapLocation({ lat: coords.latitude, lng: coords.longitude, label: 'your location' });
        const params = new URLSearchParams({
          lat: coords.latitude.toString(),
          lng: coords.longitude.toString(),
        });
        fetchConditions(params);
      },
      () => {
        setGeoLoading(false);
        setError('Location access denied. Please enter your ZIP code below.');
      },
      { timeout: 10_000, maximumAge: 300_000 }
    );
  }, [fetchConditions]);

  const handleZipSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clean = zip.trim();
    if (!/^\d{5}$/.test(clean)) {
      setError('Please enter a valid 5-digit ZIP code.');
      return;
    }
    fetchConditions(new URLSearchParams({ zip: clean }));
  }, [zip, fetchConditions]);

  return (
    <div className="flex flex-col">

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 py-20 text-white">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 50%)' }}
        />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
            <Satellite className="h-3.5 w-3.5" />
            Powered by NASA SMAP Satellite · 100% Free
          </div>
          <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Field Soil Intelligence
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-300 sm:text-xl">
            Real-time soil moisture and temperature data for every US farmer —
            no login, no charge, no subscription. Just your field conditions.
          </p>

          {/* Location controls */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={handleGeolocate}
              disabled={geoLoading || dataLoading}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 min-w-48"
            >
              {geoLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Locating…</>
              ) : (
                <><Navigation className="mr-2 h-4 w-4" /> Use My Location</>
              )}
            </Button>
            <span className="text-slate-400 text-sm hidden sm:block">or</span>
            <form onSubmit={handleZipSubmit} className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="ZIP code"
                value={zip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setZip(e.target.value.replace(/\D/g, ''))}
                className="w-32 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Button
                type="submit"
                disabled={dataLoading}
                variant="outline"
                size="default"
                className="border-white/30 text-white hover:bg-white/10 bg-transparent"
              >
                {dataLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </form>
          </div>

          {error && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </section>

      {/* ─── Location badge + conditions cards ────────────────────────────── */}
      {conditions && (
        <section className="bg-slate-50 border-b border-border/40 py-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            {/* Location badge */}
            <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-800 text-base">
                {conditions.location.label}
              </span>
              {conditions.location.state_name !== conditions.location.label && (
                <span>· {conditions.location.state_name}</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  const params = conditions.location.zip
                    ? new URLSearchParams({ zip: conditions.location.zip })
                    : new URLSearchParams({
                        lat: conditions.location.lat.toString(),
                        lng: conditions.location.lng.toString(),
                      });
                  fetchConditions(params);
                }}
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>

            {/* Drought alerts for this state */}
            {droughtAlerts.filter(a => a.state_abbr === conditions.location.state_abbr).length > 0 && (
              <div className="mb-5">
                <DroughtAlertStrip
                  alerts={droughtAlerts.filter(a => a.state_abbr === conditions.location.state_abbr)}
                />
              </div>
            )}

            {/* Condition cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {conditions.soil_moisture ? (
                <SoilMoistureCard moisture={conditions.soil_moisture} />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <Droplets className="h-8 w-8 opacity-30" />
                    <p>Soil moisture unavailable for {conditions.location.state_name}</p>
                  </CardContent>
                </Card>
              )}

              {conditions.soil_temperature ? (
                <SoilTemperatureCard
                  soilTemp={conditions.soil_temperature}
                  readiness={conditions.planting_readiness}
                />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <Thermometer className="h-8 w-8 opacity-30" />
                    <p>Soil temperature unavailable</p>
                  </CardContent>
                </Card>
              )}

              {conditions.weather ? (
                <SprayWindowCard weather={conditions.weather} />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <Wind className="h-8 w-8 opacity-30" />
                    <p>Weather data unavailable</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Zoomable field-level irrigation heatmap — reuses the location above.
          Rendered independently of `conditions` so its fetch can run in
          parallel with the soil-conditions fetch rather than waiting for it. */}
      {heatmapLocation && (
        <section className="bg-slate-50 border-b border-border/40 py-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
            <IrrigationHeatmapSection
              lat={heatmapLocation.lat}
              lng={heatmapLocation.lng}
              locationLabel={heatmapLocation.label}
            />
            <OpenETSection
              lat={heatmapLocation.lat}
              lng={heatmapLocation.lng}
              locationLabel={heatmapLocation.label}
            />
          </div>
        </section>
      )}

      {/* Loading spinner while fetching */}
      {dataLoading && !conditions && (
        <section className="bg-slate-50 border-b border-border/40 py-16">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-sm">Fetching satellite + sensor data for your location…</p>
          </div>
        </section>
      )}

      {/* ─── National moisture map ─────────────────────────────────────────── */}
      <section className="py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">National Soil Moisture Map</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                NASA SMAP 9 km satellite data · Hover a state to see VWC reading · Click to focus
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border bg-amber-50 border-amber-200 px-3 py-1.5 text-xs text-amber-700">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Data lags 1–3 days from satellite overpass
            </div>
          </div>

          {/* Drought alerts strip */}
          {droughtAlerts.length > 0 && (
            <div className="mb-6">
              <DroughtAlertStrip alerts={droughtAlerts} />
            </div>
          )}

          <div className="relative rounded-2xl border border-border/60 bg-white p-4 sm:p-6 shadow-sm">
            {mapLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/80 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                <p className="text-sm text-muted-foreground">Loading satellite moisture data…</p>
              </div>
            )}
            <USMap
              moistureData={moistureForMap}
              highlightState={highlightState}
              onStateClick={(abbr) => setHighlightState(abbr)}
            />
          </div>
        </div>
      </section>

      {/* ─── Data sources + explainer ──────────────────────────────────────── */}
      <section className="border-t border-border/40 bg-slate-50 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                <Satellite className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900">NASA SMAP Satellite</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Soil Moisture Active Passive satellite measures volumetric water content at 9 km
                resolution globally. Data refreshes daily via Crop-CASMA WPS API.
              </p>
            </div>
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <Thermometer className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Open-Meteo Sensors</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Soil temperature is sourced from the Open-Meteo weather API, combining ERA5 reanalysis
                with near real-time station data at 0–7 cm depth.
              </p>
            </div>
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <Droplets className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-slate-900">VWC Scale</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Volumetric water content (m³/m³): &lt;0.10 drought · 0.10–0.20 dry · 0.20–0.30 normal ·
                0.30–0.40 moist · &gt;0.40 saturated.
              </p>
            </div>
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100">
                <Droplets className="h-5 w-5 text-sky-600" />
              </div>
              <h3 className="font-semibold text-slate-900">OpenET Ensemble</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Satellite-based actual evapotranspiration from the OpenET Ensemble model, combining
                six independent ET models with Landsat imagery at field scale (~30m resolution).
              </p>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            This data is provided free of charge as a farmer resource. It is not a substitute for
            local field scouting. For customized recommendations, talk to an ICC agronomist.
          </p>
        </div>
      </section>
    </div>
  );
}
