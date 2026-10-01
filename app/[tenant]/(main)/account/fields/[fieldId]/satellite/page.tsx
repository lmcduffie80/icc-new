'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Loader2, AlertCircle, RefreshCw,
  Satellite, Calendar, Layers, CloudSun,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { VegetationHistoryChart } from '@/components/farm/vegetation-history-chart';
import type { SatelliteScene, VegetationStats, VegetationLayer } from '@/lib/sentinel-hub';

const SatelliteViewer = dynamic(
  () => import('@/components/farm/satellite-viewer').then((m) => m.SatelliteViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px] rounded-xl border border-border/60 bg-muted/30 text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

const LAYERS: { key: VegetationLayer; label: string; description: string }[] = [
  { key: 'ndwi',         label: 'Water Index',    description: 'NDWI — blue = well-watered, brown = dry. Best for monitoring irrigation.' },
  { key: 'ndvi',         label: 'Vegetation',     description: 'NDVI — dark green = dense healthy crop, yellow/brown = stressed or bare.' },
  { key: 'truecolor',    label: 'True Color',     description: 'Natural-color view, like a standard aerial photo.' },
  { key: 'evi',          label: 'EVI',            description: 'Enhanced Vegetation Index — more accurate than NDVI in dense crops.' },
  { key: 'false-color',  label: 'False Color',    description: 'NIR false-color — healthy vegetation appears bright red.' },
];

interface Field {
  id: string;
  polygon_name: string;
  geojson: { type: string; coordinates: [number, number][][] };
  crop_type: string | null;
}

export default function SatellitePage() {
  const router = useRouter();
  const params = useParams<{ fieldId: string }>();
  const { user, isPending } = useAuth();

  const [field, setField] = useState<Field | null>(null);
  const [scenes, setScenes] = useState<SatelliteScene[]>([]);
  const [stats, setStats] = useState<VegetationStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState<VegetationLayer>('ndwi');

  const fetchData = useCallback(async () => {
    if (!params?.fieldId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [fieldRes, satRes] = await Promise.all([
        fetch(`/api/farm/fields/${params.fieldId}`),
        fetch(`/api/farm/fields/${params.fieldId}/satellite`),
      ]);

      if (!fieldRes.ok) { setError('Field not found'); return; }

      const fieldData = await fieldRes.json();
      setField(fieldData.field);

      if (satRes.ok) {
        const satData = await satRes.json();
        setScenes(satData.scenes ?? []);
        setStats(satData.stats ?? []);
      } else {
        const satData = await satRes.json();
        setError(satData.error ?? 'Failed to load satellite data');
      }
    } catch {
      setError('Failed to load satellite data');
    } finally {
      setIsLoading(false);
    }
  }, [params?.fieldId]);

  useEffect(() => {
    if (!isPending && !user) router.push('/auth/sign-in');
    if (user) fetchData();
  }, [user, isPending, router, fetchData]);

  if (isPending || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin h-5 w-5 text-primary" />
          <span className="text-muted-foreground">Loading satellite data…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const fieldCoords = field?.geojson?.coordinates?.[0] ?? [];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">

        {/* Header */}
        <div>
          <Link href="/account/fields" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to My Fields
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <Satellite className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{field?.polygon_name ?? 'Field'}</h1>
              {field?.crop_type && <p className="text-sm text-muted-foreground">{field.crop_type}</p>}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="flex-1">{error}</p>
            <button onClick={fetchData} className="flex items-center gap-1.5 text-xs font-medium hover:underline hover:cursor-pointer">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {/* Layer selector */}
        {scenes.length > 0 && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground mr-1">Layer:</span>
              {LAYERS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setSelectedLayer(l.key)}
                  title={l.description}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:cursor-pointer ${
                    selectedLayer === l.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-foreground hover:border-primary/40'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground -mt-2">
              {LAYERS.find((l) => l.key === selectedLayer)?.description}
            </p>
          </>
        )}

        {/* Satellite map */}
        {fieldCoords.length > 0 && scenes.length > 0 && params?.fieldId && (
          <SatelliteViewer
            scenes={scenes}
            fieldCoords={fieldCoords as [number, number][]}
            selectedSceneIndex={selectedSceneIndex}
            layer={selectedLayer}
            fieldId={params.fieldId}
          />
        )}

        {/* Image date picker */}
        {scenes.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Available Scenes ({scenes.length})</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {scenes.map((scene, i) => {
                const date = new Date(scene.date);
                const isSelected = i === selectedSceneIndex;
                return (
                  <button
                    key={scene.id}
                    onClick={() => setSelectedSceneIndex(i)}
                    title={`Cloud cover: ${scene.cloudCover}%`}
                    className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs transition-all hover:cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card hover:border-primary/30'
                    }`}
                  >
                    <span className="font-medium">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-muted-foreground mt-0.5 flex items-center gap-1">
                      <CloudSun className="h-3 w-3" />
                      {scene.cloudCover}%
                    </span>
                  </button>
                );
              })}
            </div>
            {scenes[selectedSceneIndex] && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sentinel-2 · {scenes[selectedSceneIndex].cloudCover}% cloud cover
                {scenes[selectedSceneIndex].cloudCover > 30 && ' · High cloud cover may reduce image quality'}
              </p>
            )}
          </div>
        )}

        {/* NDWI + NDVI history chart */}
        {stats.length > 0 && <VegetationHistoryChart stats={stats} />}

        {/* No data state */}
        {!error && scenes.length === 0 && !isLoading && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <Satellite className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-medium mb-1">No imagery available yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sentinel-2 covers most agricultural areas every 5 days. If the field was just added,
              check back tomorrow for the first available pass.
            </p>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
