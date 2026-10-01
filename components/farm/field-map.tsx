'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map, LatLng } from 'leaflet';

interface FieldMapProps {
  /** Initial center [lat, lng] for the map. Falls back to US center. */
  center?: [number, number];
  /** If provided, displays this polygon (read-only) */
  existingCoords?: [number, number][];
  /** Called when the user finishes drawing a polygon */
  onPolygonComplete?: (coords: [number, number][]) => void;
  /** If true, shows draw controls. If false, read-only. */
  drawMode?: boolean;
  height?: string;
}

/**
 * Interactive Leaflet map for drawing and viewing field polygons.
 *
 * In drawMode=true: shows geoman polygon draw toolbar.
 * In drawMode=false (default): shows the existing polygon in blue.
 *
 * Dynamically imports Leaflet and geoman to avoid SSR issues.
 */
export function FieldMap({
  center = [39.5, -98.35], // geographic center of the contiguous US
  existingCoords,
  onPolygonComplete,
  drawMode = false,
  height = '420px',
}: FieldMapProps) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import to avoid SSR crash
    Promise.all([
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
      ...(drawMode ? [import('@geoman-io/leaflet-geoman-free'), import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css')] : []),
    ]).then(([L]) => {
      if (!containerRef.current || mapRef.current) return;

      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, { center, zoom: 13 });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Draw existing polygon
      if (existingCoords && existingCoords.length > 0) {
        const latLngs: [number, number][] = existingCoords.map(([lng, lat]) => [lat, lng]);
        const poly = L.polygon(latLngs as unknown as LatLng[], {
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.25,
          weight: 2,
        }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [30, 30] });
      }

      if (drawMode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapWithGeo = map as any;
        if (mapWithGeo.pm) {
          mapWithGeo.pm.addControls({
            position: 'topleft',
            drawMarker: false,
            drawCircleMarker: false,
            drawPolyline: false,
            drawRectangle: true,
            drawCircle: false,
            drawPolygon: true,
            editMode: true,
            dragMode: false,
            cutPolygon: false,
            removalMode: true,
          });

          // Listen for polygon completion
          map.on('pm:create', (e: unknown) => {
            const event = e as { layer: { getLatLngs: () => unknown } };
            const rings = event.layer.getLatLngs() as LatLng[][];
            const outerRing = rings[0] as LatLng[];
            // Convert to [lon, lat] pairs for Agromonitoring (which uses GeoJSON order)
            const coords: [number, number][] = outerRing.map((ll) => [ll.lng, ll.lat]);
            onPolygonComplete?.(coords);
          });
        }
      }

      setIsReady(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60">
      {!isReady && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10 text-sm text-muted-foreground"
          style={{ height }}
        >
          Loading map…
        </div>
      )}
      <div ref={containerRef} style={{ height, width: '100%' }} />
    </div>
  );
}
