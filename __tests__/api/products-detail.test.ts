import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/products/[id]/route';
import { createMockRequest, createGetRequest, parseJsonResponse } from './helpers/request-helpers';

// Mock the database with vi.hoisted
const { mockQueryOne } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: mockQueryOne,
  pool: {},
}));

vi.mock('@/lib/s3', () => ({
  getDocumentProxyUrl: (url: string | null) => url,
}));

// A valid tenant is required for most tests below since the route now
// resolves the tenant before doing anything else.
const TENANT_QUERY = { tenant_id: 'tenant-abc' };

describe('GET /api/products/[id]', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
  });

  describe('tenant scoping', () => {
    it('returns 400 when no tenant can be resolved', async () => {
      const request = createMockRequest('/api/products/abc');
      const response = await GET(request, { params: Promise.resolve({ id: 'abc' }) });
      expect(response.status).toBe(400);
      expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('scopes the lookup by tenant_id from the query param', async () => {
      mockQueryOne.mockResolvedValue({ id: 'abc', name: 'Widget', documents: [] });
      const request = createMockRequest('/api/products/abc', { searchParams: { tenant_id: 'tenant-abc' } });
      const response = await GET(request, { params: Promise.resolve({ id: 'abc' }) });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.id).toBe('abc');
      const [sql, params] = mockQueryOne.mock.calls[0];
      expect(sql).toContain('tenant_id = $2');
      expect(params).toEqual(['abc', 'tenant-abc']);
    });

    it('returns 404 when the product exists but belongs to a different tenant', async () => {
      mockQueryOne.mockResolvedValue(null);
      const request = createMockRequest('/api/products/abc', { searchParams: { tenant_id: 'tenant-other' } });
      const response = await GET(request, { params: Promise.resolve({ id: 'abc' }) });
      expect(response.status).toBe(404);
    });
  });

  describe('successful product retrieval', () => {
    it('should return product details by id', async () => {
      const mockProduct = {
        id: '1',
        name: 'Premium Herbicide',
        category: 'herbicides',
        description: 'Short description',
        full_description: 'Full detailed description',
        price: '29.99',
        original_price: '39.99',
        image: '/image.jpg',
        in_stock: true,
        inventory_count: 50,
        sku: 'HERB-001',
        rating: '4.5',
        review_count: 120,
        attributes: {
          activeIngredients: 'Test ingredient',
          epaSignalWord: 'Caution',
          epaRegistrationNumber: '12345',
          applicationRateRange: '1-2 oz/acre',
          containerSizes: '1L, 2L, 5L',
          availabilityDate: '2024-01-01',
        },
        approved_states: ['CA', 'TX', 'FL'],
        features: ['Fast acting', 'Long lasting', 'Weather resistant'],
        specifications: {
          weight: '2.5 lbs',
          volume: '1 gallon',
        },
        documents: [
          { name: 'Safety Data Sheet', url: '/docs/sds.pdf' },
          { name: 'Product Label', url: '/docs/label.pdf' },
        ],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/1', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '1' }) });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProduct);
    });

    it('should return product with all required fields', async () => {
      const mockProduct = {
        id: '2',
        name: 'Test Product',
        category: 'fungicides',
        description: 'Description',
        full_description: 'Full description',
        price: '49.99',
        original_price: null,
        image: '/image.jpg',
        in_stock: true,
        inventory_count: 100,
        sku: 'FUNG-001',
        rating: '5.0',
        review_count: 250,
        attributes: {},
        approved_states: [],
        features: [],
        specifications: {},
        documents: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/2', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '2' }) });
      const data = await parseJsonResponse(response);

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('category');
      expect(data).toHaveProperty('price');
      expect(data).toHaveProperty('in_stock');
      expect(data).toHaveProperty('inventory_count');
      expect(data).toHaveProperty('attributes');
      expect(data).toHaveProperty('approved_states');
      expect(data).toHaveProperty('features');
      expect(data).toHaveProperty('specifications');
      expect(data).toHaveProperty('documents');
    });

    it('should handle null values correctly', async () => {
      const mockProduct = {
        id: '3',
        name: 'Minimal Product',
        category: 'insecticides',
        description: null,
        full_description: null,
        price: '19.99',
        original_price: null,
        image: null,
        in_stock: false,
        inventory_count: 0,
        sku: null,
        rating: null,
        review_count: 0,
        attributes: {},
        approved_states: [],
        features: [],
        specifications: {},
        documents: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/3', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '3' }) });
      const data = await parseJsonResponse(response);

      expect(data.description).toBeNull();
      expect(data.full_description).toBeNull();
      expect(data.original_price).toBeNull();
      expect(data.image).toBeNull();
      expect(data.sku).toBeNull();
      expect(data.rating).toBeNull();
    });
  });

  describe('product not found', () => {
    it('should return 404 when product does not exist', async () => {
      mockQueryOne.mockResolvedValue(null);

      const request = createGetRequest('/api/products/999', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '999' }) });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Product not found');
    });

    it('should return 404 for non-existent UUID', async () => {
      mockQueryOne.mockResolvedValue(null);

      const request = createGetRequest('/api/products/00000000-0000-0000-0000-000000000000', TENANT_QUERY);
      const response = await GET(request, {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
      });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data.error).toBe('Product not found');
    });
  });

  describe('complex data structures', () => {
    it('should handle complex attributes object', async () => {
      const mockProduct = {
        id: '4',
        name: 'Complex Product',
        category: 'herbicides',
        description: 'Test',
        full_description: 'Test',
        price: '99.99',
        original_price: null,
        image: '/image.jpg',
        in_stock: true,
        inventory_count: 25,
        sku: 'COMPLEX-001',
        rating: '4.8',
        review_count: 75,
        attributes: {
          activeIngredients: 'Multiple ingredients here',
          epaSignalWord: 'Warning',
          epaRegistrationNumber: '67890-123',
          applicationRateRange: '0.5-4 oz per 1000 sq ft',
          containerSizes: '500ml, 1L, 2.5L, 5L, 10L',
          availabilityDate: '2024-03-15',
        },
        approved_states: ['CA', 'NY', 'TX', 'FL', 'IL', 'PA'],
        features: [
          'EPA approved',
          'Fast acting formula',
          'Long residual activity',
          'Safe for use around pets when dry',
        ],
        specifications: {
          weight: '8.5 lbs',
          volume: '2.5 gallons',
          concentration: '41%',
          phRange: '6.5-7.5',
        },
        documents: [
          { name: 'Safety Data Sheet', url: '/docs/sds-complex.pdf' },
          { name: 'Product Label', url: '/docs/label-complex.pdf' },
          { name: 'Application Guide', url: '/docs/guide.pdf' },
        ],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/4', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '4' }) });
      const data = await parseJsonResponse(response);

      expect(data.attributes).toEqual(mockProduct.attributes);
      expect(data.approved_states).toEqual(mockProduct.approved_states);
      expect(data.features).toEqual(mockProduct.features);
      expect(data.specifications).toEqual(mockProduct.specifications);
      expect(data.documents).toEqual(mockProduct.documents);
    });

    it('should handle empty arrays and objects', async () => {
      const mockProduct = {
        id: '5',
        name: 'Empty Data Product',
        category: 'herbicides',
        description: 'Test',
        full_description: 'Test',
        price: '29.99',
        original_price: null,
        image: '/image.jpg',
        in_stock: true,
        inventory_count: 10,
        sku: 'EMPTY-001',
        rating: '3.5',
        review_count: 5,
        attributes: {},
        approved_states: [],
        features: [],
        specifications: {},
        documents: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/5', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '5' }) });
      const data = await parseJsonResponse(response);

      expect(data.attributes).toEqual({});
      expect(data.approved_states).toEqual([]);
      expect(data.features).toEqual([]);
      expect(data.specifications).toEqual({});
      expect(data.documents).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return 500 error when database query fails', async () => {
      mockQueryOne.mockRejectedValue(new Error('Database connection failed'));

      const request = createGetRequest('/api/products/1', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '1' }) });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to fetch product');
    });

    it('should handle database timeout', async () => {
      mockQueryOne.mockRejectedValue(new Error('Query timeout'));

      const request = createGetRequest('/api/products/1', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '1' }) });

      expect(response.status).toBe(500);
    });
  });

  describe('different product types', () => {
    it('should handle out of stock product', async () => {
      const mockProduct = {
        id: '6',
        name: 'Out of Stock Product',
        category: 'herbicides',
        description: 'Currently unavailable',
        full_description: 'Full description',
        price: '29.99',
        original_price: null,
        image: '/image.jpg',
        in_stock: false,
        inventory_count: 0,
        sku: 'OOS-001',
        rating: '4.0',
        review_count: 30,
        attributes: {},
        approved_states: ['CA'],
        features: [],
        specifications: {},
        documents: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/6', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '6' }) });
      const data = await parseJsonResponse(response);

      expect(data.in_stock).toBe(false);
      expect(data.inventory_count).toBe(0);
    });

    it('should handle product with sale price', async () => {
      const mockProduct = {
        id: '7',
        name: 'On Sale Product',
        category: 'fungicides',
        description: 'Special offer',
        full_description: 'Full description',
        price: '24.99',
        original_price: '39.99',
        image: '/image.jpg',
        in_stock: true,
        inventory_count: 100,
        sku: 'SALE-001',
        rating: '4.7',
        review_count: 150,
        attributes: {},
        approved_states: ['CA', 'TX'],
        features: [],
        specifications: {},
        documents: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);

      const request = createGetRequest('/api/products/7', TENANT_QUERY);
      const response = await GET(request, { params: Promise.resolve({ id: '7' }) });
      const data = await parseJsonResponse(response);

      expect(parseFloat(data.price)).toBeLessThan(parseFloat(data.original_price!));
      expect(data.original_price).toBe('39.99');
    });
  });
});

