import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

const { mockVerifyAdminAuth, mockQuery, mockGenerateAcrePackProgram } = vi.hoisted(() => ({
  mockVerifyAdminAuth: vi.fn(),
  mockQuery: vi.fn(),
  mockGenerateAcrePackProgram: vi.fn(),
}));

vi.mock('@/lib/admin-middleware', () => ({
  verifyAdminAuth: mockVerifyAdminAuth,
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: { moderate: {} },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logAdminAction: vi.fn(),
    logError: vi.fn(),
    logRateLimitExceeded: vi.fn(),
  },
}));

vi.mock('@/lib/ai', () => ({
  generateAcrePackProgram: mockGenerateAcrePackProgram,
}));

import { POST } from '@/app/api/admin/acre-pack/ai-generate/route';

const AUTHORIZED_SESSION = {
  admin_user_id: 'admin-1',
  admin_email: 'admin@example.com',
  admin_name: 'Admin',
  role_name: 'super-admin',
  permissions: ['acrepack.view', 'acrepack.manage_programs', 'acrepack.manage_products'],
};

describe('POST /api/admin/acre-pack/ai-generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      session: AUTHORIZED_SESSION,
    });
  });

  it('should return 403 if admin lacks acrepack.manage_programs permission', async () => {
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      session: { ...AUTHORIZED_SESSION, permissions: ['acrepack.view'] },
    });

    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'corn' });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('should return 503 if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'corn' });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(503);
    expect(data.error).toContain('AI features are not configured');
  });

  it('should return 400 for invalid crop', async () => {
    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'bananas' });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 404 when no applicable products exist', async () => {
    mockQuery.mockResolvedValue([]);

    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'corn' });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(404);
    expect(data.error).toContain('No applicable products');
  });

  it('should return draft program on success', async () => {
    const mockProducts = [
      {
        id: 'prod-1',
        name: 'Glyphosate 41%',
        category: 'Herbicides',
        price: '3975.00',
        unit_of_measure: 'tote',
        attributes: { activeIngredients: 'Glyphosate 41%', applicationRateRange: '22-32 fl oz/ac' },
        features: ['Broad-spectrum weed control'],
        specifications: {},
      },
    ];
    mockQuery.mockResolvedValue(mockProducts);

    const mockDraft = {
      passes: [
        {
          name: 'Pre-Emerge Herbicide',
          timing_label: 'Spring',
          category: 'Herbicides',
          description: 'Burndown',
          is_required: true,
          sort_order: 1,
          products: [
            {
              product_id: 'prod-1',
              product_name: 'Glyphosate 41%',
              is_recommended: true,
              default_rate_per_acre: 32,
              min_rate: 22,
              max_rate: 44,
              rate_unit: 'fl oz',
              unit_size: 265,
              unit_size_unit: 'gal',
              lbs_per_gallon: 10,
              reasoning: 'Standard rate',
            },
          ],
        },
      ],
      summary: 'Simple corn program',
    };
    mockGenerateAcrePackProgram.mockResolvedValue(mockDraft);

    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'corn' });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.draft).toBeDefined();
    expect(data.draft.passes).toHaveLength(1);
    expect(data.draft.passes[0].name).toBe('Pre-Emerge Herbicide');
    expect(data.draft.summary).toBe('Simple corn program');
  });

  it('should return 422 when AI generates invalid product reference', async () => {
    mockQuery.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Test',
        category: 'Herbicides',
        price: '10.00',
        unit_of_measure: null,
        attributes: null,
        features: null,
        specifications: null,
      },
    ]);

    mockGenerateAcrePackProgram.mockRejectedValue(
      new Error('AI referenced unknown product_id: fake-id')
    );

    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'soybeans' });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(422);
    expect(data.error).toContain('invalid program');
  });

  it('should return 500 on unexpected errors', async () => {
    mockQuery.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Test',
        category: 'Herbicides',
        price: '10.00',
        unit_of_measure: null,
        attributes: null,
        features: null,
        specifications: null,
      },
    ]);
    mockGenerateAcrePackProgram.mockRejectedValue(new Error('Network timeout'));

    const request = createPostRequest('/api/admin/acre-pack/ai-generate', { crop: 'wheat' });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to generate');
  });
});
