import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createGetRequest,
  createPostRequest,
  createPatchRequest,
  createDeleteRequest,
  parseJsonResponse,
} from './helpers/request-helpers';

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

import { GET, POST } from '@/app/api/crop/route';

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'farmer@example.com', name: 'Test Farmer' },
};

const MOCK_PLAN = {
  id: 1,
  plan_name: 'Corn Plan 2026',
  crop: 'corn',
  plan_year: 2026,
  total_acres: '1000',
  target_weeds: ['Waterhemp'],
  weed_pressure: 'moderate',
  total_cost: null,
  cost_per_acre: null,
  status: 'draft',
  ai_generated: false,
  pass_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('GET /api/crop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(MOCK_SESSION);
  });

  it('should return 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = createGetRequest('/api/crop');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should return plans for authenticated user', async () => {
    mockQuery.mockResolvedValue([MOCK_PLAN]);
    const req = createGetRequest('/api/crop');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await parseJsonResponse(res);
    expect(data.plans).toHaveLength(1);
    expect(data.plans[0].plan_name).toBe('Corn Plan 2026');
  });

  it('should filter by year when provided', async () => {
    mockQuery.mockResolvedValue([MOCK_PLAN]);
    const req = createGetRequest('/api/crop', { year: '2026' });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('should return empty array when no plans exist', async () => {
    mockQuery.mockResolvedValue([]);
    const req = createGetRequest('/api/crop');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await parseJsonResponse(res);
    expect(data.plans).toHaveLength(0);
  });
});

describe('POST /api/crop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(MOCK_SESSION);
  });

  it('should return 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = createPostRequest('/api/crop', {
      plan_name: 'Test Plan',
      crop: 'corn',
      plan_year: 2026,
      total_acres: 1000,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('should return 400 for invalid crop', async () => {
    const req = createPostRequest('/api/crop', {
      plan_name: 'Test Plan',
      crop: 'invalid',
      plan_year: 2026,
      total_acres: 1000,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should create a plan and return 201', async () => {
    mockQuery.mockResolvedValue([{ id: 1 }]);
    const req = createPostRequest('/api/crop', {
      plan_name: 'Corn Plan 2026',
      crop: 'corn',
      plan_year: 2026,
      total_acres: 1000,
      target_weeds: ['Waterhemp'],
      weed_pressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await parseJsonResponse(res);
    expect(data.plan.id).toBe(1);
  });

  it('should return 400 when plan_name is missing', async () => {
    const req = createPostRequest('/api/crop', {
      crop: 'corn',
      plan_year: 2026,
      total_acres: 1000,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
