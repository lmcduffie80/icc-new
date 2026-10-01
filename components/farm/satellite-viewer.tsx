'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map } from 'leaflet';
import type { VegetationLayer } from '@/lib/sentinel-hub';

interface SatelliteViewerProps {
  /** Sentinel-2 scenes from the catalog API */
  scenes: { id: string; date: string; cloudCover: number }[];
  /** Field polygon coordinates [[lon, lat], ...] (GeoJSON order) */
  fieldCoords: [number, number][];
  /** Currently selected scene index */
  selectedSceneIndex: number;
  /** Vegetation layer to render */
  layer: VegetationLayer;
  /** Field ID (used to build the image endpoint URL) */
  fieldId: string;
  height?: string;
}

const LAYER_LABELS: Record<VegetationLayer, string> = {
  ndwi:         'Water Index (NDWI)',
  ndvi:         'Vegetation (NDVI)',
  truecolor:    'True Color',
  evi:          'EVI',
  'false-color':'False Color (NIR)',
};

/**
 * Leaflet map showing satellite imagery generated server-side via the
 * Sentinel Hub Process API. Images are fetched through our own API route
 * (/api/farm/fields/[fieldId]/satellite/image) which authenticates with
 * Sentinel Hub and returns a PNG cached at the CDN layer.
 *
 * Uses Leaflet ImageOverlay positioned exactly over the field bounding box.
 */
export function SatelliteViewer({
  scenes,
  fieldCoords,
  selectedSceneIndex,
  layer,
  fieldId,
  height = '500px',
}: SatelliteViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlayRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const selectedScene = scenes[selectedSceneIndex];

  // Compute bounding box [[minLat,minLon],[maxLat,maxLon]] from polygon coords
  const bounds = (() => {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const [lon, lat] of fieldCoords) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
    return [[minLat, minLon], [maxLat, maxLon]] as [[number, number], [number, number]];
  })();

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current || fieldCoords.length === 0) return;

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const latLngs = fieldCoords.map(([lng, lat]) => [lat, lng] as [number, number]);
      const leafletBounds = L.latLngBounds(latLngs);

      const map = L.map(containerRef.current!, {
        center: leafletBounds.getCenter(),
        zoom: 14,
      });
      mapRef.current = map;

      // Base layer (subtle, sits under the satellite overlay)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        opacity: 0.5,
      }).addTo(map);

      // Field polygon outline
      L.polygon(latLngs, {
        color: '#2563eb',
        fill: false,
        weight: 2.5,
        dashArray: '6 3',
      }).addTo(map);

      map.fitBounds(leafletBounds, { padding: [40, 40] });
      setIsReady(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        overlayRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update satellite image overlay when scene or layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !selectedScene) return;

    const date = selectedScene.date.split('T')[0]; // ISO date only
    const imageUrl = `/api/farm/fields/${fieldId}/satellite/image?date=${date}&layer=${layer}`;

    import('leaflet').then((L) => {
      // Remove previous overlay
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }

      setImageLoading(true);

      const overlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 0.85,
        attribution: '&copy; <a href="https://dataspace.copernicus.eu">Copernicus</a> Sentinel-2',
      });

      overlay.on('load',  () => setImageLoading(false));
      overlay.on('error', () => setImageLoading(false));

      overlay.addTo(map);
      overlayRef.current = overlay;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScene, layer, isReady]);

  if (scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-sm text-muted-foreground"
        style={{ height }}
      >
        No satellite imagery available for this field yet.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60">
      {(!isReady || imageLoading) && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted/40 z-[1000] text-sm text-muted-foreground"
          style={{ height }}
        >
          {!isReady ? 'Loading map…' : 'Fetching satellite image…'}
        </div>
      )}
      <div ref={containerRef} style={{ height, width: '100%' }} />
      {isReady && selectedScene && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border/60 bg-background/90 px-3 py-1.5 text-xs backdrop-blur-sm">
          <span className="font-medium">{LAYER_LABELS[layer]}</span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {new Date(selectedScene.date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{selectedScene.cloudCover}% cloud</span>
        </div>
      )}
      {isReady && (
        <div className="absolute top-3 right-3 z-[1000] rounded-lg border border-border/60 bg-background/90 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
          Copernicus · Sentinel-2
        </div>
      )}
    </div>
  );
}
