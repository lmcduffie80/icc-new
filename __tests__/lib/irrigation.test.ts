import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildIrrigationGridPoints,
  computeIrrigationIndex,
  fetchIrrigationGrid,
} from '@/lib/irrigation';

describe('buildIrrigationGridPoints', () => {
  it('returns gridSize x gridSize points', () => {
    const points = buildIrrigationGridPoints(41.5, -93.5, 3, 5);
    expect(points).toHaveLength(25);
  });

  it('centers the grid on the given lat/lng', () => {
    const points = buildIrrigationGridPoints(41.5, -93.5, 3, 5);
    // The middle point of an odd-sized grid should equal the center exactly
    const midIndex = Math.floor(points.length / 2);
    expect(points[midIndex].lat).toBeCloseTo(41.5, 5);
    expect(points[midIndex].lng).toBeCloseTo(-93.5, 5);
  });

  it('spans further in longitude at low latitudes than at high latitudes (mile-based spacing)', () => {
    // At higher latitude, a mile covers more degrees of longitude, so for the
    // same mile radius, the degree-span of the grid should be larger.
    const lowLatPoints = buildIrrigationGridPoints(10, -93.5, 3, 5);
    const highLatPoints = buildIrrigationGridPoints(60, -93.5, 3, 5);
    const lowLatSpan = Math.max(...lowLatPoints.map((p) => p.lng)) - Math.min(...lowLatPoints.map((p) => p.lng));
    const highLatSpan = Math.max(...highLatPoints.map((p) => p.lng)) - Math.min(...highLatPoints.map((p) => p.lng));
    expect(highLatSpan).toBeGreaterThan(lowLatSpan);
  });

  it('clamps unreasonable radius/gridSize inputs instead of exploding', () => {
    const points = buildIrrigationGridPoints(41.5, -93.5, 1000, 100);
    // gridSize clamped to MAX_GRID_SIZE (9) -> 81 points
    expect(points).toHaveLength(81);
  });

  it('handles gridSize of 1 (single point) without dividing by zero', () => {
    const points = buildIrrigationGridPoints(41.5, -93.5, 3, 1);
    expect(points).toHaveLength(1);
    expect(points[0].lat).toBeCloseTo(41.5, 5);
    expect(points[0].lng).toBeCloseTo(-93.5, 5);
  });
});

describe('computeIrrigationIndex', () => {
  it('returns a high index (irrigate_now) for dry soil and a large water deficit', () => {
    const { index, category } = computeIrrigationIndex(0.08, -30);
    expect(index).toBeGreaterThanOrEqual(75);
    expect(category).toBe('irrigate_now');
  });

  it('returns a low index (adequate) for moist soil and a positive water balance', () => {
    const { index, category } = computeIrrigationIndex(0.35, 10);
    expect(index).toBeLessThan(25);
    expect(category).toBe('adequate');
  });

  it('falls back to soil moisture alone when water balance is unavailable', () => {
    const { index } = computeIrrigationIndex(0.08, null);
    // moisture-only score should still indicate high need
    expect(index).toBeGreaterThanOrEqual(75);
  });

  it('falls back to water balance alone when soil moisture is unavailable', () => {
    const { index } = computeIrrigationIndex(null, -30);
    expect(index).toBeGreaterThanOrEqual(75);
  });

  it('defaults to a neutral 50 index when both signals are unavailable', () => {
    const { index, category } = computeIrrigationIndex(null, null);
    expect(index).toBe(50);
    expect(category).toBe('irrigate_soon');
  });

  it('clamps out-of-range moisture values instead of producing negative/overflowing scores', () => {
    const { index } = computeIrrigationIndex(-5, null); // nonsensical input
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(100);
  });
});

describe('fetchIrrigationGrid', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockOpenMeteoResponse(numLocations: number) {
    const results = Array.from({ length: numLocations }, (_, i) => ({
      current: {
        soil_moisture_1_to_3cm: 0.15 + i * 0.001,
        soil_moisture_3_to_9cm: 0.18 + i * 0.001,
      },
      daily: {
        precipitation_sum: [1, 2, 0, 0, 3, 1, 0, 0.5], // 7 past days + today
        et0_fao_evapotranspiration: [4, 4, 4, 4, 4, 4, 4, 2],
      },
    }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => results,
    } as Response);
  }

  it('fetches a grid and computes an index for every point via a single batched request', async () => {
    mockOpenMeteoResponse(25); // default 5x5 grid
    const grid = await fetchIrrigationGrid(41.5, -93.5);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(grid.points).toHaveLength(25);
    expect(grid.center).toEqual({ lat: 41.5, lng: -93.5 });
    for (const point of grid.points) {
      expect(point.index).toBeGreaterThanOrEqual(0);
      expect(point.index).toBeLessThanOrEqual(100);
      expect(point.soil_moisture).not.toBeNull();
      expect(point.water_balance_mm).not.toBeNull();
    }
  });

  it('requests multiple comma-separated coordinates in a single URL', async () => {
    mockOpenMeteoResponse(25);
    await fetchIrrigationGrid(41.5, -93.5);

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('latitude')?.split(',')).toHaveLength(25);
    expect(url.searchParams.get('longitude')?.split(',')).toHaveLength(25);
  });

  it('degrades gracefully when a point is missing data (returns default/neutral index, does not throw)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{}], // empty result for the single point
    } as Response);

    const grid = await fetchIrrigationGrid(41.5, -93.5, 1, 1);
    expect(grid.points).toHaveLength(1);
    expect(grid.points[0].soil_moisture).toBeNull();
    expect(grid.points[0].water_balance_mm).toBeNull();
    expect(grid.points[0].index).toBe(50); // neutral default
  });

  it('throws a descriptive error when the Open-Meteo request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom',
    } as Response);

    await expect(fetchIrrigationGrid(41.5, -93.5)).rejects.toThrow('Open-Meteo API error');
  });
});
