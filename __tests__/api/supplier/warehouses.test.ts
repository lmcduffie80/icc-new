import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/supplier/warehouses/route';
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

describe('GET /api/supplier/warehouses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  it('should return 401 when not authenticated', async () => {
    mockVerifySupplierAuth.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const request = createGetRequest('/api/supplier/warehouses');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return warehouses for authenticated supplier', async () => {
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

    const mockWarehouses = [
      {
        id: 'warehouse-1',
        name: 'Main Warehouse',
        address_street: '123 Main St',
        address_city: 'Atlanta',
        address_state: 'GA',
        address_zip: '30309',
        phone: '555-0100',
        email: 'warehouse@example.com',
        is_active: true,
        is_primary: true,
      },
    ];

    mockQuery.mockResolvedValue(mockWarehouses);

    const request = createGetRequest('/api/supplier/warehouses');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.warehouses).toEqual(mockWarehouses);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('sw.supplier_id = $1'),
      ['supplier-1']
    );
  });
});

describe('POST /api/supplier/warehouses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  it('should return 401 when not authenticated', async () => {
    mockVerifySupplierAuth.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const request = createPostRequest('/api/supplier/warehouses', {
      name: 'New Warehouse',
      address_street: '123 Main St',
      address_city: 'Atlanta',
      address_state: 'GA',
      address_zip: '30309',
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should create warehouse and link to supplier', async () => {
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

    const mockWarehouse = {
      id: 'warehouse-1',
      name: 'New Warehouse',
      address_street: '123 Main St',
      address_city: 'Atlanta',
      address_state: 'GA',
      address_zip: '30309',
      phone: null,
      email: null,
      is_active: true,
    };

    // First call: check if warehouse exists (return null to trigger creation path)
    // Second call: INSERT warehouse and return it
    mockQueryOne
      .mockResolvedValueOnce(null) // No existing warehouse found
      .mockResolvedValueOnce(mockWarehouse); // Newly created warehouse
    mockQuery.mockResolvedValue([]); // For unsetting primary and linking

    const request = createPostRequest('/api/supplier/warehouses', {
      name: 'New Warehouse',
      address_street: '123 Main St',
      address_city: 'Atlanta',
      address_state: 'GA',
      address_zip: '30309',
      is_primary: true,
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(201);
    expect(data.warehouse).toBeDefined();
    expect(mockQuery).toHaveBeenCalled(); // Should link warehouse to supplier
  });

  it('should return 400 for missing required fields', async () => {
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

    const request = createPostRequest('/api/supplier/warehouses', {
      name: 'New Warehouse',
      // Missing required address fields
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('required');
  });
});

