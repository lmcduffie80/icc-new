'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, MapPin, Satellite, Trash2, Loader2,
  LandPlot, AlertCircle, CheckCircle2, X, MousePointerClick,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const FieldMap = dynamic(
  () => import('@/components/farm/field-map').then((m) => m.FieldMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[480px] rounded-xl border border-border/60 bg-muted/30 text-sm text-muted-foreground animate-pulse">
        Loading map…
      </div>
    ),
  }
);

interface Field {
  id: string;
  polygon_name: string;
  agro_poly_id: string | null;
  geojson: { type: string; coordinates: [number, number][][] };
  crop_type: string | null;
  notes: string | null;
  created_at: string;
}

export default function FieldsPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();

  const [fields, setFields] = useState<Field[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Selection state — set when user clicks a field on the map
  const [selectedCoords, setSelectedCoords] = useState<[number, number][] | null>(null);
  const [polygonName, setPolygonName] = useState('');
  const [cropType, setCropType] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cropDetecting, setCropDetecting] = useState(false);
  const [detectedCrop, setDetectedCrop] = useState<string | null>(null);

  // Initial map center — use center of first saved field, else default (Georgia)
  const initialCenter: [number, number] = (() => {
    const first = fields[0];
    if (!first) return [-83.4019, 31.4395];
    const coords = first.geojson?.coordinates?.[0] ?? [];
    if (coords.length === 0) return [-83.4019, 31.4395];
    const lon = coords.reduce((s, [x]) => s + x, 0) / coords.length;
    const lat = coords.reduce((s, [, y]) => s + y, 0) / coords.length;
    return [lon, lat];
  })();

  const fetchFields = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/farm/fields');
      if (res.ok) {
        const data = await res.json();
        setFields(data.fields ?? []);
      }
    } catch {
      setError('Failed to load fields');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !user) router.push('/auth/sign-in');
    if (user) fetchFields();
  }, [user, isPending, router, fetchFields]);

  const handleFieldSelected = async (coords: [number, number][]) => {
    setSelectedCoords(coords);
    setPolygonName('');
    setCropType('');
    setDetectedCrop(null);
    setError(null);

    if (coords.length === 0) return;

    // Compute centroid of the polygon
    const lon = coords.reduce((s, [x]) => s + x, 0) / coords.length;
    const lat = coords.reduce((s, [, y]) => s + y, 0) / coords.length;

    // Query USDA Cropland Data Layer for the detected crop at this location
    setCropDetecting(true);
    try {
      const res = await fetch(`/api/farm/crop-detect?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json() as { crop: string | null };
        if (data.crop) {
          setDetectedCrop(data.crop);
          setCropType(data.crop);
        }
      }
    } catch {
      // Non-fatal — user can still enter crop type manually
    } finally {
      setCropDetecting(false);
    }
  };

  const handleSaveField = async () => {
    if (!selectedCoords || selectedCoords.length < 3) {
      setError('Select a field boundary first');
      return;
    }
    if (!polygonName.trim()) {
      setError('Enter a name for this field');
      return;
    }
    try {
      setIsSaving(true);
      setError(null);
      const res = await fetch('/api/farm/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon_name: polygonName.trim(),
          coordinates: selectedCoords,
          crop_type: cropType.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save field');
        return;
      }
      const data = await res.json();
      setFields((prev) => [data.field, ...prev]);
      setSelectedCoords(null);
      setPolygonName('');
      setCropType('');
      setDetectedCrop(null);
      setSuccess(`"${data.field.polygon_name}" saved — satellite monitoring enabled.`);
      setTimeout(() => setSuccess(null), 6000);
    } catch {
      setError('Failed to save field');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string, name: string) => {
    if (!confirm(`Delete field "${name}"? This cannot be undone.`)) return;
    try {
      setDeletingId(fieldId);
      const res = await fetch(`/api/farm/fields/${fieldId}`, { method: 'DELETE' });
      if (res.ok) {
        setFields((prev) => prev.filter((f) => f.id !== fieldId));
      } else {
        setError('Failed to delete field');
      }
    } catch {
      setError('Failed to delete field');
    } finally {
      setDeletingId(null);
    }
  };

  if (isPending || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin h-5 w-5 text-primary" />
          <span className="text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">

        {/* Header */}
        <div>
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <LandPlot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Field Satellite</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Pre-detected field boundaries shown automatically — click your field to save it.
              </p>
            </div>
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="hover:cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Map — always visible */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">Click any green boundary</span> on the map to select that field
            </span>
          </div>

          <FieldMap
            onPolygonComplete={handleFieldSelected}
            initialCenter={initialCenter}
            height="460px"
            detectedCrop={detectedCrop}
            cropDetecting={cropDetecting}
          />

          {/* Save panel — slides in when a field is selected */}
          {selectedCoords && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Field selected — {selectedCoords.length} boundary points
                </p>
                <button
                  onClick={() => { setSelectedCoords(null); setDetectedCrop(null); setError(null); }}
                  className="text-muted-foreground hover:text-foreground hover:cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Field Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={polygonName}
                    onChange={(e) => setPolygonName(e.target.value)}
                    placeholder="e.g. North Field, Back 40"
                    className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Crop Type{' '}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={cropType}
                    onChange={(e) => setCropType(e.target.value)}
                    placeholder="e.g. Corn, Soybeans, Cotton"
                    className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveField} disabled={isSaving || !polygonName.trim()}>
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  ) : (
                    <><Satellite className="h-4 w-4 mr-2" />Save &amp; Enable Satellite</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setSelectedCoords(null); setDetectedCrop(null); setError(null); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Saved fields list */}
        {fields.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Saved Fields
            </h2>
            {fields.map((field) => {
              const coords = field.geojson?.coordinates?.[0] ?? [];
              const center =
                coords.length > 0
                  ? coords.reduce(
                      ([lx, ly], [x, y]) => [lx + x / coords.length, ly + y / coords.length],
                      [0, 0]
                    )
                  : null;

              return (
                <div
                  key={field.id}
                  className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 hover:border-primary/30 transition-colors"
                >
                  <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0">
                    <LandPlot className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{field.polygon_name}</h3>
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                        <Satellite className="h-3 w-3" /> Satellite ready
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {field.crop_type && <span>{field.crop_type}</span>}
                      {center && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {Math.abs(center[1]).toFixed(4)}°{center[1] >= 0 ? 'N' : 'S'},{' '}
                          {Math.abs(center[0]).toFixed(4)}°{center[0] <= 0 ? 'W' : 'E'}
                        </span>
                      )}
                      <span>{new Date(field.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/account/fields/${field.id}/satellite`}>
                      <Button size="sm" variant="outline">
                        <Satellite className="h-4 w-4 mr-1.5" />
                        View Satellite
                      </Button>
                    </Link>
                    <button
                      onClick={() => handleDeleteField(field.id, field.polygon_name)}
                      disabled={deletingId === field.id}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 hover:cursor-pointer"
                    >
                      {deletingId === field.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state — no saved fields yet, but map is already visible above */}
        {fields.length === 0 && !selectedCoords && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Click any green field outline on the map above to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
