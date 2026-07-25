import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getProducts } from '@/app/api/products/route';
import { GET as getProductDetail } from '@/app/api/products/[id]/route';
import { createMockRequest, parseJsonResponse } from './helpers/request-helpers';

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
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

vi.mock('@/lib/s3', () => ({
  getDocumentProxyUrl: (url: string | null) => url,
}));

describe('cross-tenant isolation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('never lets tenant A list a product seeded under tenant B', async () => {
    mockQuery.mockImplementation(async (_sql: string, params: unknown[]) => {
      const requestedTenant = params[0];
      const allProducts = [
        { id: 'p1', tenant_id: 'tenant-a', name: 'Tenant A Product' },
        { id: 'p2', tenant_id: 'tenant-b', name: 'Tenant B Product' },
      ];
      return allProducts.filter((p) => p.tenant_id === requestedTenant);
    });

    const requestAsTenantA = createMockRequest('/api/products', { searchParams: { tenant_id: 'tenant-a' } });
    const response = await getProducts(requestAsTenantA);
    const data = await parseJsonResponse(response);

    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Tenant A Product');
    expect(data.some((p: { name: string }) => p.name === 'Tenant B Product')).toBe(false);
  });

  it('never lets tenant A fetch tenant B product detail by id, even knowing the id', async () => {
    mockQueryOne.mockResolvedValue(null);

    const requestAsTenantA = createMockRequest('/api/products/p2', { searchParams: { tenant_id: 'tenant-a' } });
    const response = await getProductDetail(requestAsTenantA, { params: Promise.resolve({ id: 'p2' }) });

    expect(response.status).toBe(404);
    const [, params] = mockQueryOne.mock.calls[0];
    expect(params).toEqual(['p2', 'tenant-a']);
  });

  it('never falls back to listing all products when no tenant_id is provided (rejects with 400)', async () => {
    // Regression guard: if tenant scoping is ever made "optional" by accident,
    // this must fail loudly (400) rather than silently returning an empty list
    // or — worse — every tenant's products.
    mockQuery.mockImplementation(async () => {
      const allProducts = [
        { id: 'p1', tenant_id: 'tenant-a', name: 'Tenant A Product' },
        { id: 'p2', tenant_id: 'tenant-b', name: 'Tenant B Product' },
      ];
      return allProducts;
    });

    const requestWithNoTenant = createMockRequest('/api/products');
    const response = await getProducts(requestWithNoTenant);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing tenant context');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
