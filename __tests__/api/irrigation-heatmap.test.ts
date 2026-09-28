import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetRequest, parseJsonResponse } from './helpers/request-helpers';

const { mockFetchIrrigationGrid } = vi.hoisted(() => ({
  mockFetchIrrigationGrid: vi.fn(),
}));

vi.mock('@/lib/irrigation', () => ({
  fetchIrrigationGrid: mockFetchIrrigationGrid,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: { relaxed: {} },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logError: vi.fn(),
    logRateLimitExceeded: vi.fn(),
  },
}));

import { GET } from '@/app/api/public/irrigation-heatmap/route';

const MOCK_GRID = {
  center: { lat: 41.5, lng: -93.5 },
  radius_miles: 3,
  grid_size: 5,
  points: [
    { lat: 41.5, lng: -93.5, index: 60, category: 'irrigate_soon', soil_moisture: 0.15, water_balance_mm: -12 },
  ],
  generated_at: new Date().toISOString(),
};

describe('GET /api/public/irrigation-heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when lat/lng are missing', async () => {
    const req = createGetRequest('/api/public/irrigation-heatmap');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('should return 400 when lat is out of range', async () => {
    const req = createGetRequest('/api/public/irrigation-heatmap', { lat: '200', lng: '-93.5' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('should return the grid on success (no auth required)', async () => {
    mockFetchIrrigationGrid.mockResolvedValue(MOCK_GRID);
    const req = createGetRequest('/api/public/irrigation-heatmap', { lat: '41.5', lng: '-93.5' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await parseJsonResponse(res);
    expect(data.points).toHaveLength(1);
    expect(mockFetchIrrigationGrid).toHaveBeenCalledWith(41.5, -93.5);
  });

  it('should return 502 when the upstream fetch fails', async () => {
    mockFetchIrrigationGrid.mockRejectedValue(new Error('Open-Meteo API error: 500'));
    const req = createGetRequest('/api/public/irrigation-heatmap', { lat: '41.5', lng: '-93.5' });
    const res = await GET(req);
    expect(res.status).toBe(502);
  });
});
