import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/supplier/products/route';
import { createGetRequest, createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

// Mock dependencies
const { mockQuery, mockQueryOne, mockVerifySupplierAuth, mockSecurityLogger, mockGetClientIp } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockVerifySupplierAuth: vi.fn(),
  mockSecurityLogger: vi.fn(),
  mockGetClientIp: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock('@/lib/supplier-middleware', () => ({
  verifySupplierAuth: mockVerifySupplierAuth,
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logError: mockSecurityLogger,
    logEvent: mockSecurityLogger,
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mockGetClientIp,
}));

const { mockSafeParse } = vi.hoisted(() => ({
  mockSafeParse: vi.fn(),
}));

vi.mock('@/lib/validation', () => ({
  supplierProductCreateSchema: {
    safeParse: mockSafeParse,
  },
}));

describe('GET /api/supplier/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  it('should return 401 when not authenticated', async () => {
    mockVerifySupplierAuth.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const request = createGetRequest('/api/supplier/products');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return products for authenticated supplier', async () => {
    const mockSession = {
      authorized: true,
      session: {
        user: {
          id: 'supplier-1',
          email: 'supplier@example.com',
          name: 'Test Supplier',
          company_name: 'Test Company',
        },
      },
    };

    mockVerifySupplierAuth.mockResolvedValue(mockSession);

    const mockProducts = [
      {
        id: 'product-1',
        name: 'Test Product',
        category: 'Herbicides',
        description: 'Test description',
        price: '29.99',
        approval_status: 'pending',
        sku: 'SKU-001',
        in_stock: true,
        inventory_count: 100,
        icc_available_quantity: 50,
        label_url: null,
        sds_url: null,
        admin_label_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockQuery.mockResolvedValue(mockProducts);

    const request = createGetRequest('/api/supplier/products');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.products).toEqual(mockProducts);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('supplier_id = $1'),
      ['supplier-1']
    );
  });
});

describe('POST /api/supplier/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
    // Default successful validation
    mockSafeParse.mockImplementation((data) => {
      if (data && data.name && data.category && data.price) {
        return { success: true, data };
      }
      return { success: false, error: { issues: [] } };
    });
  });

  it('should return 401 when not authenticated', async () => {
    mockVerifySupplierAuth.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const request = createPostRequest('/api/supplier/products', {
      name: 'Test Product',
      category: 'Herbicides',
      description: 'Test',
      price: 29.99,
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 403 when supplier attempts to create product (new workflow)', async () => {
    const mockSession = {
      authorized: true,
      session: {
        user: {
          id: 'supplier-1',
          email: 'supplier@example.com',
          name: 'Test Supplier',
          company_name: 'Test Company',
        },
      },
    };

    mockVerifySupplierAuth.mockResolvedValue(mockSession);

    const request = createPostRequest('/api/supplier/products', {
      name: 'Test Product',
      category: 'Herbicides',
      description: 'Test description',
      price: 29.99,
      supplier_price: 25.00,
      icc_available_quantity: 50,
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(403);
    expect(data.error).toContain('Suppliers can no longer create products directly');
    expect(data.details).toContain('contact your administrator');
  });

  it('should return 403 for any supplier product creation attempt', async () => {
    const mockSession = {
      authorized: true,
      session: {
        user: {
          id: 'supplier-1',
          email: 'supplier@example.com',
          name: 'Test Supplier',
          company_name: 'Test Company',
        },
      },
    };

    mockVerifySupplierAuth.mockResolvedValue(mockSession);

    const request = createPostRequest('/api/supplier/products', {
      // Any data should be rejected
      price: 29.99,
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(403);
    expect(data.error).toBeDefined();
  });
});

