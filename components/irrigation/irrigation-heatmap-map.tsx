'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IRRIGATION_CATEGORY_INFO, type IrrigationGrid } from '@/lib/irrigation';

const MILES_PER_DEGREE_LAT = 69.0;

interface IrrigationHeatmapMapProps {
  grid: IrrigationGrid;
}

/**
 * Zoomable field-level irrigation heatmap. Renders each grid cell as a
 * colored rectangle (green → yellow → orange → red = increasing irrigation
 * need) over an OpenStreetMap base layer, so a farmer can pan/zoom to see
 * their actual field boundaries relative to the heatmap.
 */
export function IrrigationHeatmapMap({ grid }: IrrigationHeatmapMapProps) {
  const { center, radius_miles, grid_size, points } = grid;

  const milesPerDegreeLng = MILES_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180) || MILES_PER_DEGREE_LAT;
  const cellHalfStepMiles = grid_size > 1 ? radius_miles / (grid_size - 1) : radius_miles;
  const latHalfDeg = cellHalfStepMiles / MILES_PER_DEGREE_LAT;
  const lngHalfDeg = cellHalfStepMiles / milesPerDegreeLng;

  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const latSpan = radius_miles / MILES_PER_DEGREE_LAT + latHalfDeg;
    const lngSpan = radius_miles / milesPerDegreeLng + lngHalfDeg;
    return [
      [center.lat - latSpan, center.lng - lngSpan],
      [center.lat + latSpan, center.lng + lngSpan],
    ];
  }, [center.lat, center.lng, radius_miles, latHalfDeg, lngHalfDeg, milesPerDegreeLng]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <MapContainer bounds={bounds} scrollWheelZoom style={{ height: '420px', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p, i) => {
          const info = IRRIGATION_CATEGORY_INFO[p.category];
          return (
            <Rectangle
              key={i}
              bounds={[
                [p.lat - latHalfDeg, p.lng - lngHalfDeg],
                [p.lat + latHalfDeg, p.lng + lngHalfDeg],
              ]}
              pathOptions={{
                fillColor: info.color,
                fillOpacity: 0.4,
                color: info.color,
                weight: 1,
                opacity: 0.5,
              }}
            >
              <Tooltip>
                <div className="text-xs">
                  <p className="font-semibold">{info.label}</p>
                  {p.soil_moisture != null && (
                    <p>Soil moisture: {(p.soil_moisture * 100).toFixed(1)}% VWC</p>
                  )}
                  {p.water_balance_mm != null && (
                    <p>
                      7-day balance: {p.water_balance_mm > 0 ? '+' : ''}
                      {p.water_balance_mm.toFixed(1)} mm
                    </p>
                  )}
                </div>
              </Tooltip>
            </Rectangle>
          );
        })}
        <CircleMarker
          center={[center.lat, center.lng]}
          radius={7}
          pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}
        >
          <Popup>Your location</Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
