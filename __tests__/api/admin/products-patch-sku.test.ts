import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '../../../app/api/admin/products/[id]/route';
import { createPatchRequest, parseJsonResponse } from '../helpers/request-helpers';

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

vi.mock('@/lib/email', () => ({
  sendProductDeletionApprovalNotification: vi.fn(),
}));

const adminSession = {
  session: {
    adminUser: { id: 'admin-1', user_id: 'admin-user-1' },
    permissions: ['products.update', 'products.manage_inventory'],
  },
};

const existingProduct = {
  id: 'prod-1',
  name: 'Glyphosate 53.8%',
  sku: '105001',
  category: 'Herbicides',
  price: 15.0,
  inventory_count: 28,
  in_stock: true,
  supplier_id: null,
};

describe('PATCH /api/admin/products/[id] - SKU update', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockRequireAdmin.mockReset();
    mockLogAction.mockReset();
  });

  it('should update SKU successfully', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockQueryOne
      .mockResolvedValueOnce(existingProduct)  // SELECT existing
      .mockResolvedValueOnce(null)              // Duplicate check — no duplicate
      .mockResolvedValueOnce({ ...existingProduct, sku: '105002' }); // UPDATE RETURNING
    mockLogAction.mockResolvedValue(undefined);

    const request = createPatchRequest('/api/admin/products/prod-1', { sku: '105002' });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'prod-1' }) }) as Response;
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.sku).toBe('105002');
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        before: { sku: '105001' },
        after: { sku: '105002' },
      })
    );
  });

  it('should reject duplicate SKU with 409', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockQueryOne
      .mockResolvedValueOnce(existingProduct)    // SELECT existing
      .mockResolvedValueOnce({ id: 'prod-other' }); // Duplicate found

    const request = createPatchRequest('/api/admin/products/prod-1', { sku: '105003' });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'prod-1' }) }) as Response;
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(409);
    expect(data.error).toContain('already in use');
  });

  it('should reject empty SKU', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockQueryOne.mockResolvedValueOnce(existingProduct);

    const request = createPatchRequest('/api/admin/products/prod-1', { sku: '   ' });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'prod-1' }) }) as Response;
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('SKU must be');
  });

  it('should reject SKU over 100 characters', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockQueryOne.mockResolvedValueOnce(existingProduct);

    const longSku = 'A'.repeat(101);
    const request = createPatchRequest('/api/admin/products/prod-1', { sku: longSku });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'prod-1' }) }) as Response;
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('SKU must be');
  });

  it('should reject without products.update permission', async () => {
    mockRequireAdmin.mockResolvedValue({
      session: {
        adminUser: { id: 'admin-1' },
        permissions: ['products.manage_inventory'],
      },
    });
    mockQueryOne.mockResolvedValueOnce(existingProduct);

    const request = createPatchRequest('/api/admin/products/prod-1', { sku: '105002' });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'prod-1' }) }) as Response;
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(403);
    expect(data.error).toContain('SKU update');
  });

  it('should reject when no update fields are provided', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);

    const request = createPatchRequest('/api/admin/products/prod-1', {});
    const response = await PATCH(request, { params: Promise.resolve({ id: 'prod-1' }) }) as Response;
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('No update fields');
  });
});
