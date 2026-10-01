'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, MapPin, Plus, Satellite, Trash2, Loader2,
  LandPlot, AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import map to avoid SSR issues
const FieldMap = dynamic(
  () => import('@/components/farm/field-map').then((m) => m.FieldMap),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-[420px] rounded-xl border border-border/60 bg-muted/30 text-sm text-muted-foreground">Loading map…</div> }
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

  // Draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnCoords, setDrawnCoords] = useState<[number, number][] | null>(null);
  const [polygonName, setPolygonName] = useState('');
  const [cropType, setCropType] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleSaveField = async () => {
    if (!drawnCoords || drawnCoords.length < 3) {
      setError('Please draw a polygon on the map first');
      return;
    }
    if (!polygonName.trim()) {
      setError('Please enter a name for this field');
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
          coordinates: drawnCoords,
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
      setIsDrawing(false);
      setDrawnCoords(null);
      setPolygonName('');
      setCropType('');
      setSuccess(
        data.field.agro_poly_id
          ? `"${data.field.polygon_name}" saved and registered for satellite monitoring.`
          : `"${data.field.polygon_name}" saved locally. Satellite registration pending.`
      );
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
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">My Fields</h1>
              <p className="text-muted-foreground mt-1">
                Draw your field boundaries to enable satellite monitoring
              </p>
            </div>
            {!isDrawing && (
              <Button onClick={() => { setIsDrawing(true); setError(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Field
              </Button>
            )}
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Draw new field panel */}
        {isDrawing && (
          <div className="mb-6 rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Draw Your Field</h2>
              <button
                onClick={() => { setIsDrawing(false); setDrawnCoords(null); setError(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Use the polygon tool <span className="font-medium text-foreground">(pentagon icon)</span> in the top-left of the map to draw your field boundary. Click each corner, then click the first point to close.
            </p>

            <FieldMap
              drawMode
              onPolygonComplete={(coords) => {
                setDrawnCoords(coords);
                setError(null);
              }}
            />

            {drawnCoords && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Polygon drawn — {drawnCoords.length} points
              </div>
            )}

            {/* Field details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Field Name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={polygonName}
                  onChange={(e) => setPolygonName(e.target.value)}
                  placeholder="e.g. North Field, Back 40"
                  className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Crop Type <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={cropType}
                  onChange={(e) => setCropType(e.target.value)}
                  placeholder="e.g. Corn, Soybeans, Wheat"
                  className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button onClick={handleSaveField} disabled={isSaving || !drawnCoords}>
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save Field'}
              </Button>
              <Button variant="outline" onClick={() => { setIsDrawing(false); setDrawnCoords(null); setError(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Fields list */}
        {fields.length === 0 && !isDrawing ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <LandPlot className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="font-medium text-lg mb-1">No fields yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Add your first field to start viewing satellite irrigation data.
            </p>
            <Button onClick={() => setIsDrawing(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Field
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => {
              const coords = field.geojson?.coordinates?.[0] ?? [];
              const center = coords.length > 0
                ? coords.reduce(([lx, ly], [x, y]) => [lx + x / coords.length, ly + y / coords.length], [0, 0])
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
                      {field.agro_poly_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                          <Satellite className="h-3 w-3" /> Satellite active
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          Pending registration
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {field.crop_type && <span>{field.crop_type}</span>}
                      {center && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {center[1].toFixed(4)}°N, {center[0].toFixed(4)}°W
                        </span>
                      )}
                      <span>{new Date(field.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {field.agro_poly_id && (
                      <Link href={`/account/fields/${field.id}/satellite`}>
                        <Button size="sm" variant="outline">
                          <Satellite className="h-4 w-4 mr-1.5" />
                          View Satellite
                        </Button>
                      </Link>
                    )}
                    <button
                      onClick={() => handleDeleteField(field.id, field.polygon_name)}
                      disabled={deletingId === field.id}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 hover:cursor-pointer"
                    >
                      {deletingId === field.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
