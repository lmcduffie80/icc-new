'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map as MapLibreMap, NavigationControl, AttributionControl, addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getFtwUrl } from '@/lib/ftw';

export interface FieldMapProps {
  /**
   * Called when the user selects or draws a polygon.
   * Coords are [[lon, lat], ...] in GeoJSON order (ring NOT closed).
   */
  onPolygonComplete: (coords: [number, number][]) => void;
  /** Pre-existing polygon to highlight (e.g. when editing). [[lon,lat],...] */
  existingCoords?: [number, number][];
  /** Initial map center [lon, lat]. Defaults to center-USA. */
  initialCenter?: [number, number];
  /** Whether to also show the manual draw toolbar as a fallback. */
  showDrawFallback?: boolean;
  height?: string;
}

let _pmtilesRegistered = false;

/**
 * Interactive map component powered by MapLibre GL JS.
 *
 * Shows pre-detected field boundaries sourced from the Fields of the World
 * (FTW) dataset — 3.17 billion field polygons derived from Sentinel-2 imagery
 * by Taylor Geospatial / Microsoft AI for Good (CC-BY-4.0).
 *
 * The farmer clicks their field → polygon is extracted and returned via
 * `onPolygonComplete`. A manual draw fallback is available if the field
 * isn't in the dataset.
 */
export function FieldMap({
  onPolygonComplete,
  existingCoords,
  initialCenter = [-83.4019, 31.4395], // default: Georgia
  showDrawFallback = true,
  height = '480px',
}: FieldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [ftwLoaded, setFtwLoaded] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<[number, number][] | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [status, setStatus] = useState<string>('Click your field boundary on the map');

  // Load FTW PMTiles for the current location
  const loadFtwLayer = useCallback(async (map: MapLibreMap, center: [number, number]) => {
    try {
      const pmtilesUrl = await getFtwUrl(center[1], center[0]); // lat, lon
      if (!pmtilesUrl || !map) return;

      if (map.getSource('ftw')) {
        (map.getSource('ftw') as unknown as { setUrl: (u: string) => void }).setUrl(`pmtiles://${pmtilesUrl}`);
      } else {
        map.addSource('ftw', {
          type: 'vector',
          url: `pmtiles://${pmtilesUrl}`,
          attribution: '© <a href="https://fieldsofthe.world">Fields of the World</a> (CC-BY-4.0)',
        });

        // Field fill — semi-transparent green
        map.addLayer({
          id: 'ftw-fill',
          type: 'fill',
          source: 'ftw',
          'source-layer': '2024',
          paint: {
            'fill-color': '#22c55e',
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'selected'], false], 0.55,
              ['boolean', ['feature-state', 'hovered'], false], 0.35,
              0.15,
            ],
          },
        });

        // Field outline
        map.addLayer({
          id: 'ftw-outline',
          type: 'line',
          source: 'ftw',
          'source-layer': '2024',
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false], '#16a34a',
              ['boolean', ['feature-state', 'hovered'], false], '#22c55e',
              '#4ade80',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false], 3,
              ['boolean', ['feature-state', 'hovered'], false], 2,
              1,
            ],
          },
        });
      }

      setFtwLoaded(true);
      setStatus('Click your field boundary on the map');
    } catch {
      setStatus("Couldn't load field boundaries — use draw mode below");
    }
  }, []);

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Register PMTiles protocol once globally
    if (!_pmtilesRegistered) {
      const protocol = new Protocol();
      addProtocol('pmtiles', protocol.tile.bind(protocol));
      _pmtilesRegistered = true;
    }

    const map = new MapLibreMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: initialCenter,
      zoom: 14,
      attributionControl: false,
    });

    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new NavigationControl(), 'top-right');

    mapRef.current = map;

    map.on('load', async () => {
      setIsReady(true);

      // Draw existing polygon if editing
      if (existingCoords && existingCoords.length > 0) {
        const ring = [...existingCoords, existingCoords[0]];
        map.addSource('existing', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
        });
        map.addLayer({ id: 'existing-fill', type: 'fill', source: 'existing', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'existing-line', type: 'line', source: 'existing', paint: { 'line-color': '#2563eb', 'line-width': 2.5, 'line-dasharray': [4, 2] } });
      }

      // Load FTW field boundaries
      await loadFtwLayer(map, initialCenter);
    });

    // Hover effect
    let hoveredId: number | string | null = null;
    map.on('mousemove', 'ftw-fill', (e) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = 'pointer';
      if (hoveredId !== null) map.setFeatureState({ source: 'ftw', sourceLayer: '2024', id: hoveredId }, { hovered: false });
      hoveredId = e.features[0].id ?? null;
      if (hoveredId !== null) map.setFeatureState({ source: 'ftw', sourceLayer: '2024', id: hoveredId }, { hovered: true });
    });
    map.on('mouseleave', 'ftw-fill', () => {
      map.getCanvas().style.cursor = '';
      if (hoveredId !== null) map.setFeatureState({ source: 'ftw', sourceLayer: '2024', id: hoveredId }, { hovered: false });
      hoveredId = null;
    });

    // Track selected ID for highlight
    let selectedId: number | string | null = null;

    // Click to select a field
    map.on('click', 'ftw-fill', (e) => {
      if (!e.features?.length) return;
      const feature = e.features[0];
      if (!feature.geometry || feature.geometry.type !== 'Polygon') return;

      // Deselect previous
      if (selectedId !== null) map.setFeatureState({ source: 'ftw', sourceLayer: '2024', id: selectedId }, { selected: false });
      selectedId = feature.id ?? null;
      if (selectedId !== null) map.setFeatureState({ source: 'ftw', sourceLayer: '2024', id: selectedId }, { selected: true });

      // Extract outer ring, drop closing coord
      const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][];
      const coords = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
        ? ring.slice(0, -1)
        : ring;

      setSelectedCoords(coords);
      setStatus(`Field selected — ${coords.length} vertices · Save below`);
      onPolygonComplete(coords);
    });

    // Reload FTW when the user pans to a different area (state/country)
    let lastLoadCenter = initialCenter;
    map.on('moveend', async () => {
      const c = map.getCenter();
      const distKm = Math.sqrt(
        Math.pow((c.lng - lastLoadCenter[0]) * 111, 2) +
        Math.pow((c.lat - lastLoadCenter[1]) * 111, 2)
      );
      if (distKm > 200) {
        lastLoadCenter = [c.lng, c.lat];
        await loadFtwLayer(map, [c.lng, c.lat]);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground flex-1">{status}</p>
        {selectedCoords && (
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
            Field selected
          </span>
        )}
      </div>

      {/* Map container */}
      <div className="relative rounded-xl overflow-hidden border border-border/60">
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/40 z-10 gap-2 text-sm text-muted-foreground" style={{ height }}>
            <span className="animate-pulse">Loading map…</span>
          </div>
        )}
        {isReady && !ftwLoaded && (
          <div className="absolute top-3 left-3 z-10 rounded-lg bg-background/90 border border-border/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            Loading field boundaries…
          </div>
        )}
        {isReady && ftwLoaded && (
          <div className="absolute top-3 left-3 z-10 rounded-lg bg-background/90 border border-border/60 px-3 py-1.5 text-xs backdrop-blur-sm flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span>FTW field boundaries · click to select</span>
          </div>
        )}
        <div ref={containerRef} style={{ height, width: '100%' }} />
      </div>

      {/* Draw fallback */}
      {showDrawFallback && isReady && (
        <p className="text-xs text-muted-foreground text-center">
          Can't find your field?{' '}
          <button
            onClick={() => setDrawMode((v) => !v)}
            className="underline underline-offset-2 hover:text-foreground hover:cursor-pointer transition-colors"
          >
            {drawMode ? 'Cancel draw mode' : 'Draw it manually'}
          </button>
        </p>
      )}
    </div>
  );
}
