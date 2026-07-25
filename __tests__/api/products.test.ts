import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/products/route';
import { createMockRequest, parseJsonResponse } from './helpers/request-helpers';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: vi.fn(),
  pool: {},
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: { relaxed: {} },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: { logRateLimitExceeded: vi.fn(), logValidationFailure: vi.fn(), logEvent: vi.fn() },
}));

describe('GET /api/products', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 400 when no tenant can be resolved', async () => {
    mockQuery.mockResolvedValue([]);
    const request = createMockRequest('/api/products');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('filters by tenant_id from the query param', async () => {
    mockQuery.mockResolvedValue([{ id: '1', name: 'Widget' }]);
    const request = createMockRequest('/api/products', { searchParams: { tenant_id: 'tenant-abc' } });
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data).toEqual([{ id: '1', name: 'Widget' }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id = $1');
    expect(params[0]).toBe('tenant-abc');
  });

  it('filters by tenant_id from the x-tenant-id header when present', async () => {
    mockQuery.mockResolvedValue([]);
    const request = createMockRequest('/api/products', { headers: { 'x-tenant-id': 'tenant-xyz' } });
    await GET(request);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('tenant-xyz');
  });
});
