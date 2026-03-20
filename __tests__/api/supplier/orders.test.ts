import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/supplier/orders/route';
import { createGetRequest, parseJsonResponse } from '../helpers/request-helpers';

// Mock dependencies
const { mockQuery, mockVerifySupplierAuth, mockSecurityLogger, mockGetClientIp } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockVerifySupplierAuth: vi.fn(),
  mockSecurityLogger: vi.fn(),
  mockGetClientIp: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
}));

vi.mock('@/lib/supplier-middleware', () => ({
  verifySupplierAuth: mockVerifySupplierAuth,
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logError: mockSecurityLogger,
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mockGetClientIp,
}));

describe('GET /api/supplier/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  it('should return 401 when not authenticated', async () => {
    mockVerifySupplierAuth.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const request = createGetRequest('/api/supplier/orders');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return orders for supplier products only', async () => {
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

    const mockOrders = [
      {
        order_id: 'order-1',
        order_number: 'ORD-001',
        order_status: 'pending',
        order_date: '2024-01-01T00:00:00Z',
        customer_name: 'John Doe',
        customer_email: 'john@example.com',
        product_name: 'Test Product',
        product_id: 'product-1',
        quantity: 2,
        price: '29.99',
        total: '59.98',
      },
    ];

    mockQuery.mockResolvedValue(mockOrders);

    const request = createGetRequest('/api/supplier/orders');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.orders).toEqual(mockOrders);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('p.supplier_id = $1'),
      ['supplier-1']
    );
  });

  it('should return empty array when no orders exist', async () => {
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
    mockQuery.mockResolvedValue([]);

    const request = createGetRequest('/api/supplier/orders');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.orders).toEqual([]);
  });
});

