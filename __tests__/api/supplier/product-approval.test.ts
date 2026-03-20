import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as ApproveLabel } from '@/app/api/supplier/products/[id]/approve-label/route';
import { POST as RejectLabel } from '@/app/api/supplier/products/[id]/reject-label/route';
import { createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

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

describe('POST /api/supplier/products/:id/approve-label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  it('should return 401 when not authenticated', async () => {
    mockVerifySupplierAuth.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const request = createPostRequest('/api/supplier/products/product-1/approve-label', {
      token: 'valid-token',
    });
    const response = await ApproveLabel(request, { params: Promise.resolve({ id: 'product-1' }) });

    expect(response.status).toBe(401);
  });

  it('should return 400 for invalid token', async () => {
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
    mockQueryOne.mockResolvedValue(null); // Token not found

    const request = createPostRequest('/api/supplier/products/product-1/approve-label', {
      token: 'invalid-token',
    });
    const response = await ApproveLabel(request, { params: Promise.resolve({ id: 'product-1' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('token');
  });

  it('should approve label and publish product', async () => {
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

    // Mock token verification
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'token-1',
        product_id: 'product-1',
        supplier_id: 'supplier-1',
        action: 'approve',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used_at: null,
      })
      // Mock product verification
      .mockResolvedValueOnce({
        id: 'product-1',
        supplier_id: 'supplier-1',
        approval_status: 'label_pending_supplier_approval',
        admin_label_url: 'https://example.com/admin-label.pdf',
      });

    mockQuery.mockResolvedValue([]); // For updates

    const request = createPostRequest('/api/supplier/products/product-1/approve-label', {
      token: 'valid-token',
    });
    const response = await ApproveLabel(request, { params: Promise.resolve({ id: 'product-1' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("approval_status = 'published'"),
      expect.any(Array)
    );
  });
});

describe('POST /api/supplier/products/:id/reject-label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  it('should reject label and set product to pending', async () => {
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

    // Mock token verification
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'token-1',
        product_id: 'product-1',
        supplier_id: 'supplier-1',
        action: 'reject',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used_at: null,
      })
      // Mock product verification
      .mockResolvedValueOnce({
        id: 'product-1',
        supplier_id: 'supplier-1',
        approval_status: 'label_pending_supplier_approval',
      });

    mockQuery.mockResolvedValue([]); // For updates

    const request = createPostRequest('/api/supplier/products/product-1/reject-label', {
      token: 'valid-token',
    });
    const response = await RejectLabel(request, { params: Promise.resolve({ id: 'product-1' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("approval_status = 'pending'"),
      expect.any(Array)
    );
  });
});

