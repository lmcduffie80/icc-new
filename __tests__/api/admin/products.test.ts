import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/admin/products/route';
import { createGetRequest, createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

// Mock dependencies with vi.hoisted
const { mockQuery, mockQueryOne, mockRequireAdmin, mockLogAction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockLogAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/audit', () => ({
  logAction: mockLogAction,
}));

describe('GET /api/admin/products', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockRequireAdmin.mockReset();
    mockLogAction.mockReset();
  });

  describe('authorized requests', () => {
    it('should return all products for admin with products.view permission', async () => {
      const mockSession = {
        session: { userId: 'admin-user-1' },
        adminUser: {
          id: 'admin-1',
          user_id: 'admin-user-1',
          role_id: 'role-1',
          is_active: true,
          permissions: ['products.view'],
        },
      };

      mockRequireAdmin.mockResolvedValue({ error: null, session: mockSession });

      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Test product',
          full_description: 'Full description',
          sku: 'HERB-001',
          price: '29.99',
          original_price: null,
          image: '/image.jpg',
          in_stock: true,
          inventory_count: 50,
          rating: '4.5',
          review_count: 100,
          attributes: {},
          approved_states: ['CA'],
          features: [],
          specifications: {},
          documents: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/admin/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
      expect(mockRequireAdmin).toHaveBeenCalledWith('products.view');
    });

    it('should filter products by category', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { permissions: ['products.view'] } },
      });

      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/admin/products', { category: 'herbicides' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should filter products by in_stock status', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { permissions: ['products.view'] } },
      });

      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/admin/products', { in_stock: 'true' });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should search products by name, description, or SKU', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { permissions: ['products.view'] } },
      });

      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/admin/products', { search: 'premium' });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('unauthorized requests', () => {
    it('should return 403 when user lacks products.view permission', async () => {
      const errorResponse = {
        json: vi.fn().mockReturnValue({ error: 'Forbidden' }),
        status: 403,
      };

      mockRequireAdmin.mockResolvedValue({ error: errorResponse, session: null });

      const request = createGetRequest('/api/admin/products');
      await GET(request);

      expect(mockRequireAdmin).toHaveBeenCalledWith('products.view');
    });
  });
});

describe('POST /api/admin/products', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockRequireAdmin.mockReset();
    mockLogAction.mockReset();
  });

  describe('authorized requests', () => {
    it('should create product with valid data', async () => {
      const mockSession = {
        session: { userId: 'admin-user-1' },
        adminUser: {
          id: 'admin-1',
          user_id: 'admin-user-1',
          role_id: 'role-1',
          is_active: true,
          permissions: ['products.create'],
        },
      };

      mockRequireAdmin.mockResolvedValue({ error: null, session: mockSession });

      const mockProduct = {
        id: 'prod-1',
        name: 'New Product',
        category: 'herbicides',
        description: 'Test description',
        full_description: 'Full description',
        sku: 'HERB-001',
        price: '29.99',
        original_price: null,
        image: '/image.jpg',
        in_stock: true,
        inventory_count: 100,
        rating: null,
        review_count: 0,
        attributes: {},
        approved_states: ['CA', 'TX'],
        features: ['Fast acting'],
        specifications: {},
        documents: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQuery.mockResolvedValue([]); // no duplicate SKU
      mockQueryOne.mockResolvedValue(mockProduct);
      mockLogAction.mockResolvedValue(undefined);

      const requestBody = {
        name: 'New Product',
        category: 'herbicides',
        supplier_id: 'supplier-123',
        description: 'Test description',
        full_description: 'Full description',
        sku: 'HERB-001',
        price: 29.99,
        in_stock: true,
        inventory_count: 100,
        attributes: {},
        approved_states: ['CA', 'TX'],
        features: ['Fast acting'],
        specifications: {},
        documents: [],
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(data).toEqual(mockProduct);
      expect(mockRequireAdmin).toHaveBeenCalledWith('products.create');
      expect(mockLogAction).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        action: 'create',
        resourceType: 'product',
        resourceId: 'prod-1',
        after: mockProduct,
      });
    });

    it('should create product with minimal required fields', async () => {
      const mockSession = {
        session: { userId: 'admin-user-1' },
        adminUser: { id: 'admin-1', permissions: ['products.create'] },
      };

      mockRequireAdmin.mockResolvedValue({ error: null, session: mockSession });

      const mockProduct = {
        id: 'prod-2',
        name: 'Minimal Product',
        category: 'fungicides',
        description: null,
        full_description: null,
        sku: null,
        price: '19.99',
        original_price: null,
        image: null,
        in_stock: true,
        inventory_count: 0,
        rating: null,
        review_count: 0,
        attributes: null,
        approved_states: [],
        features: [],
        specifications: null,
        documents: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);
      mockLogAction.mockResolvedValue(undefined);

      const requestBody = {
        name: 'Minimal Product',
        category: 'fungicides',
        supplier_id: 'supplier-123',
        price: 19.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(data.name).toBe('Minimal Product');
    });

    it('should stamp tenant_id on the INSERT, defaulting to tenant_icc_default when no tenant is resolvable', async () => {
      const mockSession = {
        session: { userId: 'admin-user-1' },
        adminUser: { id: 'admin-1', permissions: ['products.create'] },
      };

      mockRequireAdmin.mockResolvedValue({ error: null, session: mockSession });

      const mockProduct = {
        id: 'prod-4',
        name: 'Tenant Stamped Product',
        category: 'herbicides',
        price: '29.99',
      };

      mockQuery.mockResolvedValue([]); // no duplicate SKU
      mockQueryOne.mockResolvedValue(mockProduct);
      mockLogAction.mockResolvedValue(undefined);

      const requestBody = {
        name: 'Tenant Stamped Product',
        category: 'herbicides',
        supplier_id: 'supplier-123',
        sku: 'HERB-999',
        price: 29.99,
      };

      // No x-tenant-id header and no ?tenant_id= — /admin isn't tenant-scoped yet.
      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);

      expect(response.status).toBe(201);
      const [sql, params] = mockQueryOne.mock.calls[0];
      expect(sql).toContain('INSERT INTO products');
      expect(sql).toMatch(/\(\s*tenant_id,/);
      expect(params[0]).toBe('tenant_icc_default');
    });
  });

  describe('validation', () => {
    it('should return 400 when name is missing', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { id: 'admin-1', permissions: ['products.create'] } },
      });

      const requestBody = {
        category: 'herbicides',
        price: 29.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Name, category, price, and supplier are required');
    });

    it('should return 400 when category is missing', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { id: 'admin-1', permissions: ['products.create'] } },
      });

      const requestBody = {
        name: 'Test Product',
        price: 29.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name, category, price, and supplier are required');
    });

    it('should return 400 when price is missing', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { id: 'admin-1', permissions: ['products.create'] } },
      });

      const requestBody = {
        name: 'Test Product',
        category: 'herbicides',
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name, category, price, and supplier are required');
    });

    it('should return 400 when supplier_id is missing', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { id: 'admin-1', permissions: ['products.create'] } },
      });

      const requestBody = {
        name: 'Test Product',
        category: 'herbicides',
        price: 29.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name, category, price, and supplier are required');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 403 when user lacks products.create permission', async () => {
      const errorResponse = {
        json: vi.fn().mockReturnValue({ error: 'Forbidden' }),
        status: 403,
      };

      mockRequireAdmin.mockResolvedValue({ error: errorResponse, session: null });

      const requestBody = {
        name: 'Test Product',
        category: 'herbicides',
        price: 29.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      await POST(request);

      expect(mockRequireAdmin).toHaveBeenCalledWith('products.create');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database insert fails', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        session: { adminUser: { id: 'admin-1', permissions: ['products.create'] } },
      });

      mockQueryOne.mockRejectedValue(new Error('Database error'));

      const requestBody = {
        name: 'Test Product',
        category: 'herbicides',
        supplier_id: 'supplier-123',
        price: 29.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to create product');
    });
  });

  describe('audit logging', () => {
    it('should log product creation action', async () => {
      const mockSession = {
        session: { userId: 'admin-user-1' },
        adminUser: {
          id: 'admin-1',
          permissions: ['products.create'],
        },
      };

      mockRequireAdmin.mockResolvedValue({ error: null, session: mockSession });

      const mockProduct = {
        id: 'prod-3',
        name: 'Audited Product',
        category: 'herbicides',
        description: null,
        full_description: null,
        sku: null,
        price: '29.99',
        original_price: null,
        image: null,
        in_stock: true,
        inventory_count: 0,
        rating: null,
        review_count: 0,
        attributes: null,
        approved_states: [],
        features: [],
        specifications: null,
        documents: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockProduct);
      mockLogAction.mockResolvedValue(undefined);

      const requestBody = {
        name: 'Audited Product',
        category: 'herbicides',
        supplier_id: 'supplier-123',
        price: 29.99,
      };

      const request = createPostRequest('/api/admin/products', requestBody);
      await POST(request);

      expect(mockLogAction).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        action: 'create',
        resourceType: 'product',
        resourceId: 'prod-3',
        after: mockProduct,
      });
    });
  });
});

