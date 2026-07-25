import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/products/route';
import { createMockRequest, parseJsonResponse } from './helpers/request-helpers';

const { mockQuery, mockCheckRateLimit, mockCreateRateLimitResponse } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCheckRateLimit: vi.fn().mockResolvedValue({ success: true }),
  mockCreateRateLimitResponse: vi.fn(
    (reset?: number) =>
      new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Retry-After': String(reset ?? 60) },
      })
  ),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: vi.fn(),
  pool: {},
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: { relaxed: {} },
  checkRateLimit: mockCheckRateLimit,
  createRateLimitResponse: mockCreateRateLimitResponse,
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: { logRateLimitExceeded: vi.fn(), logValidationFailure: vi.fn(), logEvent: vi.fn() },
}));

// A valid tenant is required for most tests below since the route now
// resolves the tenant before doing anything else.
const TENANT_QUERY = { searchParams: { tenant_id: 'tenant-abc' } };

describe('GET /api/products', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockCreateRateLimitResponse.mockClear();
  });

  describe('tenant scoping', () => {
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

  describe('list all products', () => {
    it('should return all products when no filters are applied', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Test product 1',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
        {
          id: '2',
          name: 'Product 2',
          category: 'fungicides',
          description: 'Test product 2',
          price: '39.99',
          original_price: '49.99',
          image: '/image2.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
      expect(data).toHaveLength(2);
    });

    it('should return empty array when no products exist', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
      expect(data).toHaveLength(0);
    });
  });

  describe('filter by category', () => {
    it('should filter products by category', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Herbicide Product',
          category: 'herbicides',
          description: 'Herbicide',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', category: 'herbicides' },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
      expect(data.every((p: { category: string }) => p.category === 'herbicides')).toBe(true);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('LOWER(category) = LOWER(');
    });

    it('should not filter when category is "all"', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Test',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
        {
          id: '2',
          name: 'Product 2',
          category: 'fungicides',
          description: 'Test',
          price: '39.99',
          original_price: null,
          image: '/image2.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', category: 'all' },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).not.toContain('LOWER(category)');
    });

    it('should handle case-insensitive category filtering', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', category: 'HERBICIDES' },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
      // The SQL query should use LOWER() for case-insensitive comparison
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('LOWER(category) = LOWER(');
      expect(params).toContain('HERBICIDES');
    });
  });

  describe('search functionality', () => {
    it('should search products by name', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Premium Herbicide',
          category: 'herbicides',
          description: 'Best product',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', search: 'Premium' },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
    });

    it('should search products by description', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Contains special formula',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', search: 'special' },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
    });

    it('should return empty array when search has no matches', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', search: 'nonexistent' },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should handle search with special characters', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', search: '%special$' },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should reject search queries longer than 100 characters', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', search: 'a'.repeat(101) },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Search query too long');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('combined filters', () => {
    it('should filter by both category and search', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Premium Herbicide',
          category: 'herbicides',
          description: 'Best herbicide',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', {
        searchParams: { tenant_id: 'tenant-abc', category: 'herbicides', search: 'Premium' },
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
    });
  });

  describe('sorting', () => {
    it('should return products sorted by created_at DESC', async () => {
      const mockProducts = [
        {
          id: '2',
          name: 'Newer Product',
          category: 'herbicides',
          description: 'Newer',
          price: '39.99',
          original_price: null,
          image: '/image2.jpg',
          in_stock: true,
        },
        {
          id: '1',
          name: 'Older Product',
          category: 'herbicides',
          description: 'Older',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('LIMIT 100');
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when the rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: false, reset: Date.now() + 30000 });

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);

      expect(response.status).toBe(429);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should proceed to query products when the rate limit check passes', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should return 500 error when database query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to fetch products');
    });

    it('should handle database timeout errors', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('response structure', () => {
    it('should return products with correct structure', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Test Product',
          category: 'herbicides',
          description: 'Description',
          price: '29.99',
          original_price: '39.99',
          image: '/image.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('category');
      expect(data[0]).toHaveProperty('description');
      expect(data[0]).toHaveProperty('price');
      expect(data[0]).toHaveProperty('image');
      expect(data[0]).toHaveProperty('in_stock');
    });

    it('should handle null values correctly', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Test Product',
          category: 'herbicides',
          description: null,
          price: '29.99',
          original_price: null,
          image: null,
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(data[0].description).toBeNull();
      expect(data[0].original_price).toBeNull();
      expect(data[0].image).toBeNull();
    });

    it('should set caching headers on a successful response', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createMockRequest('/api/products', TENANT_QUERY);
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toContain('public');
    });
  });
});
