import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostRequest, parseJsonResponse } from './helpers/request-helpers';

const { mockGetSession, mockQuery, mockGenerateFarmerPlan } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockQuery: vi.fn(),
  mockGenerateFarmerPlan: vi.fn(),
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

vi.mock('@/lib/ai', () => ({
  generateFarmerPlan: mockGenerateFarmerPlan,
}));

import { POST } from '@/app/api/crop/generate/route';

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'farmer@example.com', name: 'Test Farmer' },
};

const MOCK_PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Glyphosate 41%',
    category: 'Herbicides',
    price: '3975.00',
    unit_of_measure: 'tote',
    attributes: { activeIngredients: 'Glyphosate 41%' },
    features: null,
    specifications: null,
  },
];

const MOCK_DRAFT = {
  passes: [
    {
      name: 'Pre-Emergent Herbicide',
      category: 'Pre-Emergent',
      timing_label: 'At planting',
      sort_order: 1,
      products: [
        {
          product_id: 'prod-1',
          product_name: 'Glyphosate 41%',
          is_recommended: true,
          rate_per_acre: 22,
          rate_unit: 'fl oz',
          unit_size: 265,
          unit_size_unit: 'gal',
          lbs_per_gallon: 10,
          reasoning: 'Effective burndown for waterhemp',
        },
      ],
    },
  ],
  summary: 'Waterhemp control program',
  weed_management_notes: 'Rotate modes of action.',
};

describe('POST /api/crop/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    mockGetSession.mockResolvedValue(MOCK_SESSION);
  });

  it('should return 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: ['Waterhemp'],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('should return 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: ['Waterhemp'],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it('should return 400 for invalid crop', async () => {
    const req = createPostRequest('/api/crop/generate', {
      crop: 'invalid-crop',
      acres: 1000,
      targetWeeds: ['Waterhemp'],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should return 400 when targetWeeds is empty', async () => {
    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: [],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should return 404 when no products are available', async () => {
    mockQuery.mockResolvedValue([]);
    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: ['Waterhemp'],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('should return the AI draft on success', async () => {
    mockQuery.mockResolvedValue(MOCK_PRODUCTS);
    mockGenerateFarmerPlan.mockResolvedValue(MOCK_DRAFT);

    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: ['Waterhemp', 'Palmer amaranth'],
      weedPressure: 'heavy',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await parseJsonResponse(res);
    expect(data.draft.passes).toHaveLength(1);
    expect(data.draft.summary).toBe('Waterhemp control program');
  });

  it('should return 422 when AI references invalid product IDs', async () => {
    mockQuery.mockResolvedValue(MOCK_PRODUCTS);
    mockGenerateFarmerPlan.mockRejectedValue(new Error('AI referenced unknown product_id: bad-id'));

    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: ['Waterhemp'],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('should return 500 on unexpected error', async () => {
    mockQuery.mockResolvedValue(MOCK_PRODUCTS);
    mockGenerateFarmerPlan.mockRejectedValue(new Error('Unexpected failure'));

    const req = createPostRequest('/api/crop/generate', {
      crop: 'corn',
      acres: 1000,
      targetWeeds: ['Waterhemp'],
      weedPressure: 'moderate',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
