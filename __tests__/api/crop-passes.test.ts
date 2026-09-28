import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostRequest, parseJsonResponse } from './helpers/request-helpers';

const { mockGetSession, mockQuery } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: { moderate: {}, relaxed: {} },
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

import { POST } from '@/app/api/crop/[planId]/passes/route';

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'farmer@example.com', name: 'Test Farmer' },
};

const MOCK_PLAN_ROW = { id: 1, crop: 'corn', total_acres: '1000' };

function basicPass(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Pre-Emergent Herbicide',
    category: 'Pre-Emergent',
    timing_label: 'At planting',
    sort_order: 1,
    products: [
      {
        product_id: 'prod-1',
        product_name: 'Dry Granular Herbicide',
        is_recommended: true,
        rate_per_acre: 2,
        rate_unit: 'lbs',
        unit_size: 50,
        unit_size_unit: 'lbs',
        // Dry/granular products aren't liquid — this can legitimately be 0
        // rather than null depending on how the source data was stored.
        lbs_per_gallon: 0,
        units_needed: 40,
        unit_cost: 10,
        line_total: 400,
        cost_per_acre: 0.4,
        sort_order: 0,
        ...overrides,
      },
    ],
  };
}

function callPasses(planId: string, body: Record<string, unknown>) {
  const req = createPostRequest(`/api/crop/${planId}/passes`, body);
  return POST(req, { params: Promise.resolve({ planId }) });
}

describe('POST /api/crop/[planId]/passes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(MOCK_SESSION);
  });

  it('should return 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await callPasses('1', { passes: [basicPass()] });
    expect(res.status).toBe(401);
  });

  it('should return 400 for a non-numeric plan ID', async () => {
    const res = await callPasses('not-a-number', { passes: [basicPass()] });
    expect(res.status).toBe(400);
  });

  it('should return 404 when the plan does not belong to the user', async () => {
    mockQuery.mockResolvedValueOnce([]); // plan lookup returns nothing
    const res = await callPasses('1', { passes: [basicPass()] });
    expect(res.status).toBe(404);
  });

  it('should accept lbs_per_gallon: 0 for non-liquid products (regression)', async () => {
    mockQuery
      .mockResolvedValueOnce([MOCK_PLAN_ROW]) // plan ownership lookup
      .mockResolvedValueOnce([]) // DELETE existing passes
      .mockResolvedValueOnce([{ id: 10 }]) // INSERT pass
      .mockResolvedValueOnce([]) // INSERT product
      .mockResolvedValueOnce([]); // UPDATE plan totals

    const res = await callPasses('1', {
      passes: [basicPass({ lbs_per_gallon: 0 })],
      total_cost: 400,
      cost_per_acre: 0.4,
      ai_generated: true,
    });

    expect(res.status).toBe(200);
    const data = await parseJsonResponse(res);
    expect(data.success).toBe(true);
  });

  it('should still accept a null lbs_per_gallon', async () => {
    mockQuery
      .mockResolvedValueOnce([MOCK_PLAN_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await callPasses('1', {
      passes: [basicPass({ lbs_per_gallon: null })],
    });

    expect(res.status).toBe(200);
  });

  it('should return 400 when lbs_per_gallon is negative', async () => {
    const res = await callPasses('1', {
      passes: [basicPass({ lbs_per_gallon: -5 })],
    });
    expect(res.status).toBe(400);
  });

  it('should return 400 for malformed JSON body', async () => {
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/crop/1/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    const res = await POST(req, { params: Promise.resolve({ planId: '1' }) });
    expect(res.status).toBe(400);
  });
});
